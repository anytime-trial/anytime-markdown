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
	get root(): string | null { return this.rootPath; }

	/** リポジトリ名とブランチ名を返す */
	getRepoInfo(): { repoName: string; branchName: string } | null {
		if (!this.rootPath) { return null; }
		// .git ディレクトリまたはファイルを探す
		let dir = this.rootPath;
		while (dir !== path.dirname(dir)) {
			const gitPath = path.join(dir, '.git');
			if (fs.existsSync(gitPath)) {
				const repoName = path.basename(dir);
				let branchName = 'HEAD';
				try {
					const headPath = fs.statSync(gitPath).isDirectory()
						? path.join(gitPath, 'HEAD')
						: gitPath;
					if (fs.statSync(gitPath).isDirectory()) {
						const head = fs.readFileSync(headPath, 'utf-8').trim();
						const match = head.match(/^ref: refs\/heads\/(.+)$/);
						branchName = match ? match[1] : head.substring(0, 7);
					}
				} catch { /* ignore */ }
				return { repoName, branchName };
			}
			dir = path.dirname(dir);
		}
		return { repoName: path.basename(this.rootPath), branchName: '' };
	}

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

	/** git リポジトリのルートディレクトリを返す */
	private findGitRoot(): string | null {
		if (!this.rootPath) { return null; }
		let dir = this.rootPath;
		while (dir !== path.dirname(dir)) {
			if (fs.existsSync(path.join(dir, '.git'))) { return dir; }
			dir = path.dirname(dir);
		}
		return null;
	}

	async switchBranch(): Promise<void> {
		const gitRoot = this.findGitRoot();
		if (!gitRoot) {
			vscode.window.showWarningMessage('Git repository not found.');
			return;
		}

		const { execSync } = await import('child_process');

		// ローカル＋リモートブランチ一覧を取得
		let branches: string[];
		try {
			const output = execSync('git branch -a --no-color', { cwd: gitRoot, encoding: 'utf-8' });
			branches = output.split('\n')
				.map(b => b.replace(/^\*?\s+/, '').trim())
				.filter(b => b && !b.includes('HEAD'))
				.map(b => b.replace(/^remotes\/origin\//, ''))
				.filter((b, i, arr) => arr.indexOf(b) === i); // 重複排除
		} catch {
			vscode.window.showErrorMessage('Failed to list branches.');
			return;
		}

		// 現在のブランチ
		const info = this.getRepoInfo();
		const currentBranch = info?.branchName ?? '';

		const items = branches.map(b => ({
			label: b,
			description: b === currentBranch ? '(current)' : '',
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select branch to checkout',
		});
		if (!selected || selected.label === currentBranch) { return; }

		try {
			execSync(`git checkout ${selected.label}`, { cwd: gitRoot, encoding: 'utf-8' });
			this._onDidChangeTreeData.fire(undefined);
			vscode.window.showInformationMessage(`Switched to branch: ${selected.label}`);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Checkout failed: ${msg}`);
		}
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
