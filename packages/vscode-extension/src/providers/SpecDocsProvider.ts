import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const STORAGE_KEY = 'anytimeMarkdown.specDocsRoot';
const MD_ONLY_KEY = 'anytimeMarkdown.mdOnly';

function isMarkdownFile(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export class SpecDocsItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly resourceUri: vscode.Uri,
		public readonly isDirectory: boolean,
		collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
		if (isDirectory) {
			this.contextValue = 'folder';
			this.iconPath = vscode.ThemeIcon.Folder;
		} else {
			this.contextValue = 'file';
			this.iconPath = vscode.ThemeIcon.File;
			this.command = {
				command: 'vscode.openWith',
				title: 'Open',
				arguments: [resourceUri, 'anytimeMarkdown'],
			};
		}
	}
}

export class SpecDocsProvider implements vscode.TreeDataProvider<SpecDocsItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<SpecDocsItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private rootPath: string | null = null;
	private _mdOnly: boolean;

	constructor(private readonly context: vscode.ExtensionContext) {
		const saved = context.globalState.get<string>(STORAGE_KEY);
		if (saved && fs.existsSync(saved)) {
			this.rootPath = saved;
			vscode.commands.executeCommand('setContext', 'anytimeMarkdown.specDocsHasRoot', true);
		}
		this._mdOnly = context.globalState.get<boolean>(MD_ONLY_KEY, true);
		vscode.commands.executeCommand('setContext', 'anytimeMarkdown.mdOnly', this._mdOnly);
	}

	get mdOnly(): boolean { return this._mdOnly; }

	getTreeItem(element: SpecDocsItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: SpecDocsItem): SpecDocsItem[] {
		if (!this.rootPath) {
			return [];
		}

		const dirPath = element ? element.resourceUri.fsPath : this.rootPath;
		if (!fs.existsSync(dirPath)) {
			return [];
		}

		const entries = fs.readdirSync(dirPath, { withFileTypes: true });
		const items: SpecDocsItem[] = [];

		// ディレクトリ
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
			const fullPath = path.join(dirPath, entry.name);
			if (this._mdOnly && !this.containsMarkdown(fullPath)) continue;
			items.push(new SpecDocsItem(
				entry.name,
				vscode.Uri.file(fullPath),
				true,
				vscode.TreeItemCollapsibleState.Collapsed,
			));
		}

		// ファイル
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (entry.name.startsWith('.')) continue;
			if (this._mdOnly && !isMarkdownFile(entry.name)) continue;
			items.push(new SpecDocsItem(
				entry.name,
				vscode.Uri.file(path.join(dirPath, entry.name)),
				false,
				vscode.TreeItemCollapsibleState.None,
			));
		}

		return items;
	}

	private containsMarkdown(dirPath: string): boolean {
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isFile() && (entry.name.toLowerCase().endsWith('.md') || entry.name.toLowerCase().endsWith('.markdown'))) {
					return true;
				}
				if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
					if (this.containsMarkdown(path.join(dirPath, entry.name))) {
						return true;
					}
				}
			}
		} catch { /* ignore */ }
		return false;
	}

	async openFolder(): Promise<void> {
		const uris = await vscode.window.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			openLabel: 'Select Folder',
		});
		if (uris && uris.length > 0) {
			this.setRoot(uris[0].fsPath);
		}
	}

	async cloneRepository(): Promise<void> {
		const url = await vscode.window.showInputBox({
			prompt: 'Git repository URL',
			placeHolder: 'https://github.com/user/repo.git',
		});
		if (!url) return;

		const targetDirs = await vscode.window.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			openLabel: 'Select Clone Destination',
		});
		if (!targetDirs || targetDirs.length === 0) return;

		const repoName = path.basename(url, '.git').replace(/\.git$/, '') || 'repo';
		const clonePath = path.join(targetDirs[0].fsPath, repoName);

		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Cloning repository...' },
			async () => {
				const { exec } = await import('child_process');
				await new Promise<void>((resolve, reject) => {
					exec(`git clone ${url} "${clonePath}"`, (error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				});
			}
		);

		this.setRoot(clonePath);
	}

	closeFolder(): void {
		this.rootPath = null;
		this.context.globalState.update(STORAGE_KEY, undefined);
		vscode.commands.executeCommand('setContext', 'anytimeMarkdown.specDocsHasRoot', false);
		this._onDidChangeTreeData.fire(undefined);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	toggleMdOnly(): void {
		this._mdOnly = !this._mdOnly;
		this.context.globalState.update(MD_ONLY_KEY, this._mdOnly);
		vscode.commands.executeCommand('setContext', 'anytimeMarkdown.mdOnly', this._mdOnly);
		this._onDidChangeTreeData.fire(undefined);
	}

	private setRoot(dirPath: string): void {
		this.rootPath = dirPath;
		this.context.globalState.update(STORAGE_KEY, dirPath);
		vscode.commands.executeCommand('setContext', 'anytimeMarkdown.specDocsHasRoot', true);
		this._onDidChangeTreeData.fire(undefined);
	}
}
