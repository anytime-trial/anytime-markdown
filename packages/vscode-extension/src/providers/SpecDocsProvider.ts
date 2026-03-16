import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const STORAGE_KEY = 'anytimeMarkdown.specDocsRoot';
const STORAGE_KEY_MULTI = 'anytimeMarkdown.specDocsRoots';
const MD_ONLY_KEY = 'anytimeMarkdown.mdOnly';

function isMarkdownFile(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export class SpecDocsRootItem extends vscode.TreeItem {
	constructor(public readonly rootPath: string, repoName: string) {
		super(repoName, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = 'specDocsRoot';
		this.iconPath = new vscode.ThemeIcon('repo');
		this.resourceUri = vscode.Uri.file(rootPath);
	}
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
			if (isMarkdownFile(label)) {
				this.command = {
					command: 'anytime-markdown.specDocsOpenFile',
					title: 'Open',
					arguments: [resourceUri],
				};
			} else {
				this.command = {
					command: 'vscode.open',
					title: 'Open',
					arguments: [resourceUri],
				};
			}
		}
	}
}

export class SpecDocsDragAndDrop implements vscode.TreeDragAndDropController<SpecDocsRootItem | SpecDocsItem> {
	readonly dropMimeTypes = ['application/vnd.code.tree.anytimemarkdown.specdocs'];
	readonly dragMimeTypes = ['application/vnd.code.tree.anytimemarkdown.specdocs'];

	constructor(private readonly provider: SpecDocsProvider) {}

	handleDrag(source: readonly (SpecDocsRootItem | SpecDocsItem)[], dataTransfer: vscode.DataTransfer): void {
		// SpecDocsRootItem はドラッグ対象外
		const items = source.filter((s): s is SpecDocsItem => s instanceof SpecDocsItem);
		if (items.length === 0) return;
		dataTransfer.set(
			'application/vnd.code.tree.anytimemarkdown.specdocs',
			new vscode.DataTransferItem(items.map(s => s.resourceUri.fsPath)),
		);
	}

	async handleDrop(target: SpecDocsRootItem | SpecDocsItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
		const raw = dataTransfer.get('application/vnd.code.tree.anytimemarkdown.specdocs');
		if (!raw) return;
		const sourcePaths: string[] = raw.value;
		if (!sourcePaths || sourcePaths.length === 0) return;

		// ドロップ先のディレクトリを決定
		let destDir: string;
		if (target instanceof SpecDocsRootItem) {
			destDir = target.rootPath;
		} else if (target && target.isDirectory) {
			destDir = target.resourceUri.fsPath;
		} else if (target && !target.isDirectory) {
			destDir = path.dirname(target.resourceUri.fsPath);
		} else {
			// ルートにドロップ（複数ルートの場合はソースのルートを使用）
			const roots = this.provider.roots;
			if (roots.length === 0) return;
			// ソースファイルが属するルートを判定
			const srcRoot = roots.find(r => {
				const nr = r.endsWith(path.sep) ? r : r + path.sep;
				return sourcePaths[0] === r || sourcePaths[0].startsWith(nr);
			});
			if (!srcRoot) return;
			destDir = srcRoot;
		}

		for (const srcPath of sourcePaths) {
			const name = path.basename(srcPath);
			const dest = path.join(destDir, name);
			if (srcPath === dest) continue;
			try {
				fs.renameSync(srcPath, dest);
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				vscode.window.showErrorMessage(`Move failed: ${msg}`);
			}
		}
		this.provider.refresh();
	}
}

export class SpecDocsProvider implements vscode.TreeDataProvider<SpecDocsRootItem | SpecDocsItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<SpecDocsRootItem | SpecDocsItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private rootPaths: string[] = [];
	private _mdOnly: boolean;

	constructor(private readonly context: vscode.ExtensionContext) {
		// マイグレーション: 旧 string → 新 string[]
		const savedMulti = context.globalState.get<string[]>(STORAGE_KEY_MULTI);
		if (savedMulti) {
			this.rootPaths = savedMulti.filter(p => fs.existsSync(p));
		} else {
			const savedSingle = context.globalState.get<string>(STORAGE_KEY);
			if (savedSingle && fs.existsSync(savedSingle)) {
				this.rootPaths = [savedSingle];
				// 新キーに保存してから旧キーをクリア
				context.globalState.update(STORAGE_KEY_MULTI, this.rootPaths);
			}
			context.globalState.update(STORAGE_KEY, undefined);
		}
		if (this.rootPaths.length > 0) {
			vscode.commands.executeCommand('setContext', 'anytimeMarkdown.specDocsHasRoot', true);
		}
		this._mdOnly = context.globalState.get<boolean>(MD_ONLY_KEY, true);
		vscode.commands.executeCommand('setContext', 'anytimeMarkdown.mdOnly', this._mdOnly);
	}

	get mdOnly(): boolean { return this._mdOnly; }
	get roots(): string[] { return [...this.rootPaths]; }

	private saveRootPaths(): void {
		this.context.globalState.update(STORAGE_KEY_MULTI, this.rootPaths.length > 0 ? this.rootPaths : undefined);
		vscode.commands.executeCommand('setContext', 'anytimeMarkdown.specDocsHasRoot', this.rootPaths.length > 0);
	}

	/** 指定ルートパスのリポジトリ名とブランチ名を返す */
	getRepoInfo(rootPath?: string): { repoName: string; branchName: string } | null {
		const target = rootPath ?? this.rootPaths[0];
		if (!target) { return null; }
		// .git ディレクトリまたはファイルを探す
		let dir = target;
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
		return { repoName: path.basename(target), branchName: '' };
	}

	/** ファイルパスが属するルートを返す */
	findRootForPath(filePath: string): string | null {
		// 最も長いマッチを返す（ネストしたルート対応）
		let best: string | null = null;
		for (const root of this.rootPaths) {
			const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
			if ((filePath === root || filePath.startsWith(normalizedRoot)) && (!best || root.length > best.length)) {
				best = root;
			}
		}
		return best;
	}

	getTreeItem(element: SpecDocsRootItem | SpecDocsItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: SpecDocsRootItem | SpecDocsItem): (SpecDocsRootItem | SpecDocsItem)[] {
		if (!element) {
			// トップレベル: ルートが1つならファイルツリーを直接表示、複数ならRootItem
			if (this.rootPaths.length === 0) {
				return [];
			}
			if (this.rootPaths.length === 1) {
				return this.getFileChildren(this.rootPaths[0]);
			}
			return this.rootPaths.map(rootPath => {
				const info = this.getRepoInfo(rootPath);
				const label = info
					? (info.branchName ? `${info.repoName} / ${info.branchName}` : info.repoName)
					: path.basename(rootPath);
				return new SpecDocsRootItem(rootPath, label);
			});
		}

		if (element instanceof SpecDocsRootItem) {
			return this.getFileChildren(element.rootPath);
		}

		// SpecDocsItem (directory)
		return this.getFileChildren(element.resourceUri.fsPath);
	}

	private getFileChildren(dirPath: string): SpecDocsItem[] {
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
			this.addRoot(uris[0].fsPath);
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
				const { execFile } = await import('child_process');
				await new Promise<void>((resolve, reject) => {
					execFile('git', ['clone', url, clonePath], (error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				});
			}
		);

		this.addRoot(clonePath);
	}

	closeFolder(): void {
		this.rootPaths = [];
		this.saveRootPaths();
		this._onDidChangeTreeData.fire(undefined);
	}

	addRoot(dirPath: string): void {
		// 重複チェック
		if (this.rootPaths.includes(dirPath)) {
			return;
		}
		this.rootPaths.push(dirPath);
		this.saveRootPaths();
		this._onDidChangeTreeData.fire(undefined);
	}

	removeRoot(rootPath: string): void {
		const idx = this.rootPaths.indexOf(rootPath);
		if (idx === -1) return;
		this.rootPaths.splice(idx, 1);
		this.saveRootPaths();
		this._onDidChangeTreeData.fire(undefined);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	async createFile(item?: SpecDocsRootItem | SpecDocsItem): Promise<void> {
		let dir: string | undefined;
		if (item instanceof SpecDocsRootItem) {
			dir = item.rootPath;
		} else if (item?.isDirectory) {
			dir = item.resourceUri.fsPath;
		} else if (item) {
			dir = path.dirname(item.resourceUri.fsPath);
		} else {
			dir = this.rootPaths[0];
		}
		if (!dir) return;
		const name = await vscode.window.showInputBox({ prompt: 'File name', placeHolder: 'newfile.md' });
		if (!name) return;
		const filePath = path.join(dir, name);
		try {
			fs.writeFileSync(filePath, '', 'utf-8');
			this.refresh();
		} catch (e: unknown) {
			vscode.window.showErrorMessage(`Create file failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async deleteItem(item: SpecDocsItem): Promise<void> {
		const answer = await vscode.window.showWarningMessage(
			`"${item.label}" を削除しますか？`,
			{ modal: true },
			'Delete',
		);
		if (answer !== 'Delete') return;
		try {
			if (item.isDirectory) {
				fs.rmSync(item.resourceUri.fsPath, { recursive: true });
			} else {
				fs.unlinkSync(item.resourceUri.fsPath);
			}
			this.refresh();
		} catch (e: unknown) {
			vscode.window.showErrorMessage(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async renameItem(item: SpecDocsItem): Promise<void> {
		const oldName = path.basename(item.resourceUri.fsPath);
		const name = await vscode.window.showInputBox({ prompt: 'New name', value: oldName });
		if (!name || name === oldName) return;
		const newPath = path.join(path.dirname(item.resourceUri.fsPath), name);
		try {
			fs.renameSync(item.resourceUri.fsPath, newPath);
			this.refresh();
		} catch (e: unknown) {
			vscode.window.showErrorMessage(`Rename failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async createFolder(item?: SpecDocsRootItem | SpecDocsItem): Promise<void> {
		let dir: string | undefined;
		if (item instanceof SpecDocsRootItem) {
			dir = item.rootPath;
		} else if (item?.isDirectory) {
			dir = item.resourceUri.fsPath;
		} else if (item) {
			dir = path.dirname(item.resourceUri.fsPath);
		} else {
			dir = this.rootPaths[0];
		}
		if (!dir) return;
		const name = await vscode.window.showInputBox({ prompt: 'Folder name', placeHolder: 'newfolder' });
		if (!name) return;
		const folderPath = path.join(dir, name);
		try {
			fs.mkdirSync(folderPath, { recursive: true });
			this.refresh();
		} catch (e: unknown) {
			vscode.window.showErrorMessage(`Create folder failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/** git リポジトリのルートディレクトリを返す */
	private findGitRoot(rootPath?: string): string | null {
		const target = rootPath ?? this.rootPaths[0];
		if (!target) { return null; }
		let dir = target;
		while (dir !== path.dirname(dir)) {
			if (fs.existsSync(path.join(dir, '.git'))) { return dir; }
			dir = path.dirname(dir);
		}
		return null;
	}

	async switchBranch(rootPath?: string): Promise<void> {
		const gitRoot = this.findGitRoot(rootPath);
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
		const info = this.getRepoInfo(rootPath);
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
}
