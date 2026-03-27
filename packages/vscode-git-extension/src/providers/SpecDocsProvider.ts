import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { showError } from '../utils/errorHelpers';

const STORAGE_KEY = 'anytimeGit.specDocsRoot';
const STORAGE_KEY_MULTI = 'anytimeGit.specDocsRoots';
const MD_ONLY_KEY = 'anytimeGit.mdOnly';

function isMarkdownFile(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/** ディレクトリを遡って .git ディレクトリ/ファイルのパスを返す */
function findGitDir(startDir: string): string | null {
	let dir = startDir;
	while (dir !== path.dirname(dir)) {
		const gitPath = path.join(dir, '.git');
		if (fs.existsSync(gitPath)) return gitPath;
		dir = path.dirname(dir);
	}
	return null;
}

/** .git パスからブランチ名を読み取る */
function readGitBranch(gitPath: string): string {
	try {
		if (!fs.statSync(gitPath).isDirectory()) return 'HEAD';
		const headPath = path.join(gitPath, 'HEAD');
		const head = fs.readFileSync(headPath, 'utf-8').trim();
		const match = head.match(/^ref: refs\/heads\/(.+)$/);
		return match ? match[1] : head.substring(0, 7);
	} catch {
		return 'HEAD';
	}
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
					command: 'anytime-git.specDocsOpenFile',
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

/** SpecDocs ツリーで扱うノード型 */
export type SpecDocsNode = SpecDocsRootItem | SpecDocsItem;

export class SpecDocsDragAndDrop implements vscode.TreeDragAndDropController<SpecDocsNode> {
	readonly dropMimeTypes = ['application/vnd.code.tree.anytimegit.specdocs', 'text/uri-list'];
	readonly dragMimeTypes = ['application/vnd.code.tree.anytimegit.specdocs'];

	constructor(private readonly provider: SpecDocsProvider) {}

	handleDrag(source: readonly SpecDocsNode[], dataTransfer: vscode.DataTransfer): void {
		// SpecDocsRootItem はドラッグ対象外
		const items = source.filter((s): s is SpecDocsItem => s instanceof SpecDocsItem);
		if (items.length === 0) return;
		dataTransfer.set(
			'application/vnd.code.tree.anytimegit.specdocs',
			new vscode.DataTransferItem(items.map(s => s.resourceUri.fsPath)),
		);
	}

	/** ドロップターゲットからディレクトリパスを解決する */
	private resolveDropDir(target: SpecDocsNode | undefined, fallbackRoots?: string[]): string | undefined {
		if (target instanceof SpecDocsRootItem) return target.rootPath;
		if (target?.isDirectory) return target.resourceUri.fsPath;
		if (target && !target.isDirectory) return path.dirname(target.resourceUri.fsPath);
		return fallbackRoots?.[0];
	}

	async handleDrop(target: SpecDocsNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
		// 内部ドラッグ（移動）— 外部ドロップより先に判定する
		// VS Code はツリー内ドラッグでも text/uri-list を含めるため、カスタム MIME を優先する
		const raw = dataTransfer.get('application/vnd.code.tree.anytimegit.specdocs');
		if (raw) {
			const sourcePaths: string[] = raw.value;
			if (sourcePaths && sourcePaths.length > 0) {
				const destDir = this.resolveInternalDropDir(target, sourcePaths);
				if (!destDir) return;

				for (const srcPath of sourcePaths) {
					const name = path.basename(srcPath);
					const dest = path.join(destDir, name);
					if (srcPath === dest) continue;
					try {
						fs.renameSync(srcPath, dest);
					} catch (e: unknown) {
						showError('Move failed', e);
					}
				}
				this.provider.refresh();
				return;
			}
		}

		// 外部ファイルのドロップ（コピー）
		const uriList = dataTransfer.get('text/uri-list');
		if (!uriList) return;
		await this.handleExternalDrop(target, uriList);
	}

	/** 内部ドラッグのドロップ先ディレクトリを決定する */
	private resolveInternalDropDir(target: SpecDocsNode | undefined, sourcePaths: string[]): string | undefined {
		const resolved = this.resolveDropDir(target);
		if (resolved) return resolved;

		// ルートにドロップ（複数ルートの場合はソースのルートを使用）
		const roots = this.provider.roots;
		if (roots.length === 0) return undefined;
		const srcRoot = roots.find(r => {
			const nr = r.endsWith(path.sep) ? r : r + path.sep;
			return sourcePaths[0] === r || sourcePaths[0].startsWith(nr);
		});
		return srcRoot;
	}

	private async handleExternalDrop(target: SpecDocsNode | undefined, uriList: vscode.DataTransferItem): Promise<void> {
		const destDir = this.resolveDropDir(target, this.provider.roots);
		if (!destDir) return;

		const uris = await this.parseUriList(uriList);
		if (uris.length === 0) return;

		for (const uri of uris) {
			await this.copyFileWithOverwriteCheck(uri.fsPath, destDir);
		}
		this.provider.refresh();
	}

	/** text/uri-list からファイル URI を解析する */
	private async parseUriList(uriList: vscode.DataTransferItem): Promise<vscode.Uri[]> {
		const raw = await uriList.asString();
		return raw.split(/\r?\n/)
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'))
			.map(line => {
				try { return vscode.Uri.parse(line); } catch { return null; }
			})
			.filter((u): u is vscode.Uri => u !== null && u.scheme === 'file');
	}

	/** ファイルをコピーする（上書き確認付き） */
	private async copyFileWithOverwriteCheck(srcPath: string, destDir: string): Promise<void> {
		const name = path.basename(srcPath);
		const dest = path.join(destDir, name);
		if (srcPath === dest) return;

		if (fs.existsSync(dest)) {
			const answer = await vscode.window.showWarningMessage(
				`"${name}" already exists. Overwrite?`,
				{ modal: true },
				'Overwrite',
			);
			if (answer !== 'Overwrite') return;
		}

		try {
			fs.copyFileSync(srcPath, dest);
		} catch (e: unknown) {
			showError('Copy failed', e);
		}
	}
}

export class SpecDocsProvider implements vscode.TreeDataProvider<SpecDocsNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<SpecDocsNode | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private rootPaths: string[] = [];
	private _mdOnly: boolean;
	private clipboard: { paths: string[]; isCut: boolean } | null = null;

	constructor(private readonly context: vscode.ExtensionContext) {
		// マイグレーション: 旧 string → 新 string[]
		const savedMulti = context.globalState.get<string[]>(STORAGE_KEY_MULTI);
		if (savedMulti) {
			this.rootPaths = savedMulti.filter(p => fs.existsSync(p));
		} else {
			const savedSingle = context.globalState.get<string>(STORAGE_KEY);
			if (savedSingle && fs.existsSync(savedSingle)) {
				this.rootPaths = [savedSingle];
			}
		}
		this._mdOnly = context.globalState.get<boolean>(MD_ONLY_KEY, true);
		this.initAsync();
	}

	/** コンストラクタから呼び出す非同期初期化（Thenable を返す操作を分離） */
	private initAsync(): void {
		// マイグレーション: 旧キーから新キーへの移行（rootPaths が旧キー由来ならば新キーに保存）
		const savedMulti = this.context.globalState.get<string[]>(STORAGE_KEY_MULTI);
		if (!savedMulti && this.rootPaths.length > 0) {
			void this.context.globalState.update(STORAGE_KEY_MULTI, this.rootPaths);
		}
		if (!savedMulti) {
			void this.context.globalState.update(STORAGE_KEY, undefined);
		}
		if (this.rootPaths.length > 0) {
			void vscode.commands.executeCommand('setContext', 'anytimeGit.specDocsHasRoot', true);
		}
		void vscode.commands.executeCommand('setContext', 'anytimeGit.mdOnly', this._mdOnly);
	}

	get mdOnly(): boolean { return this._mdOnly; }
	get roots(): string[] { return [...this.rootPaths]; }

	private saveRootPaths(): void {
		this.context.globalState.update(STORAGE_KEY_MULTI, this.rootPaths.length > 0 ? this.rootPaths : undefined);
		vscode.commands.executeCommand('setContext', 'anytimeGit.specDocsHasRoot', this.rootPaths.length > 0);
	}

	/** 指定ルートパスのリポジトリ名とブランチ名を返す */
	getRepoInfo(rootPath?: string): { repoName: string; branchName: string } | null {
		const target = rootPath ?? this.rootPaths[0];
		if (!target) { return null; }
		const gitPath = findGitDir(target);
		if (!gitPath) {
			return { repoName: path.basename(target), branchName: '' };
		}
		const repoName = path.basename(path.dirname(gitPath));
		const branchName = readGitBranch(gitPath);
		return { repoName, branchName };
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

	getTreeItem(element: SpecDocsNode): vscode.TreeItem {
		return element;
	}

	private getRootLabel(rootPath: string): string {
		const info = this.getRepoInfo(rootPath);
		if (!info) return path.basename(rootPath);
		return info.branchName ? `${info.repoName} / ${info.branchName}` : info.repoName;
	}

	getChildren(element?: SpecDocsNode): SpecDocsNode[] {
		if (!element) {
			return this.rootPaths.map(rootPath => new SpecDocsRootItem(rootPath, this.getRootLabel(rootPath)));
		}
		if (element instanceof SpecDocsRootItem) {
			return this.getFileChildren(element.rootPath);
		}
		return this.getFileChildren(element.resourceUri.fsPath);
	}

	private isVisibleDir(entry: fs.Dirent): boolean {
		return entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules';
	}

	private getFileChildren(dirPath: string): SpecDocsItem[] {
		if (!fs.existsSync(dirPath)) {
			return [];
		}

		const entries = fs.readdirSync(dirPath, { withFileTypes: true });
		const dirs = this.getDirItems(entries, dirPath);
		const files = this.getFileItems(entries, dirPath);
		return [...dirs, ...files];
	}

	private getDirItems(entries: fs.Dirent[], dirPath: string): SpecDocsItem[] {
		const items: SpecDocsItem[] = [];
		for (const entry of entries) {
			if (!this.isVisibleDir(entry)) continue;
			const fullPath = path.join(dirPath, entry.name);
			if (this._mdOnly && !this.containsMarkdown(fullPath)) continue;
			items.push(new SpecDocsItem(
				entry.name, vscode.Uri.file(fullPath), true, vscode.TreeItemCollapsibleState.Collapsed,
			));
		}
		return items;
	}

	private getFileItems(entries: fs.Dirent[], dirPath: string): SpecDocsItem[] {
		const items: SpecDocsItem[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || entry.name.startsWith('.')) continue;
			if (this._mdOnly && !isMarkdownFile(entry.name)) continue;
			items.push(new SpecDocsItem(
				entry.name, vscode.Uri.file(path.join(dirPath, entry.name)), false, vscode.TreeItemCollapsibleState.None,
			));
		}
		return items;
	}

	private containsMarkdown(dirPath: string): boolean {
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			return entries.some(entry => this.isMarkdownEntry(entry, dirPath));
		} catch { /* ignore */ }
		return false;
	}

	private isMarkdownEntry(entry: fs.Dirent, dirPath: string): boolean {
		if (entry.isFile()) {
			return isMarkdownFile(entry.name);
		}
		if (this.isVisibleDir(entry)) {
			return this.containsMarkdown(path.join(dirPath, entry.name));
		}
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
				const { execFile } = await import('node:child_process');
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

	/** アイテムからドロップ先/作成先ディレクトリを解決する */
	private resolveDestDir(item?: SpecDocsNode): string | undefined {
		if (item instanceof SpecDocsRootItem) return item.rootPath;
		if (item?.isDirectory) return item.resourceUri.fsPath;
		if (item) return path.dirname(item.resourceUri.fsPath);
		return this.rootPaths[0];
	}

	async createFile(item?: SpecDocsNode): Promise<void> {
		const dir = this.resolveDestDir(item);
		if (!dir) return;
		const name = await vscode.window.showInputBox({ prompt: 'File name', placeHolder: 'newfile.md' });
		if (!name) return;
		const filePath = path.join(dir, name);
		try {
			fs.writeFileSync(filePath, '', 'utf-8');
			this.refresh();
		} catch (e: unknown) {
			showError('Create file failed', e);
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
			showError('Delete failed', e);
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
			showError('Rename failed', e);
		}
	}

	async createFolder(item?: SpecDocsNode): Promise<void> {
		const dir = this.resolveDestDir(item);
		if (!dir) return;
		const name = await vscode.window.showInputBox({ prompt: 'Folder name', placeHolder: 'newfolder' });
		if (!name) return;
		const folderPath = path.join(dir, name);
		try {
			fs.mkdirSync(folderPath, { recursive: true });
			this.refresh();
		} catch (e: unknown) {
			showError('Create folder failed', e);
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

		const { execFileSync } = await import('node:child_process');

		// ローカル＋リモートブランチ一覧を取得
		let branches: string[];
		try {
			const output = execFileSync('git', ['branch', '-a', '--no-color'], { cwd: gitRoot, encoding: 'utf-8' });
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
			execFileSync('git', ['checkout', selected.label], { cwd: gitRoot, encoding: 'utf-8' });
			this._onDidChangeTreeData.fire(undefined);
			vscode.window.showInformationMessage(`Switched to branch: ${selected.label}`);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Checkout failed: ${msg}`);
		}
	}

	async importFiles(item?: SpecDocsNode): Promise<void> {
		const destDir = this.resolveDestDir(item);
		if (!destDir) return;

		const uris = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: true,
			openLabel: 'Import',
		});
		if (!uris || uris.length === 0) return;

		for (const uri of uris) {
			const name = path.basename(uri.fsPath);
			const dest = path.join(destDir, name);
			if (uri.fsPath === dest) continue;
			if (fs.existsSync(dest)) {
				const answer = await vscode.window.showWarningMessage(
					`"${name}" already exists. Overwrite?`,
					{ modal: true },
					'Overwrite',
				);
				if (answer !== 'Overwrite') continue;
			}
			try {
				fs.copyFileSync(uri.fsPath, dest);
			} catch (e: unknown) {
				showError('Import failed', e);
			}
		}
		this.refresh();
	}

	toggleMdOnly(): void {
		this._mdOnly = !this._mdOnly;
		this.context.globalState.update(MD_ONLY_KEY, this._mdOnly);
		vscode.commands.executeCommand('setContext', 'anytimeGit.mdOnly', this._mdOnly);
		this._onDidChangeTreeData.fire(undefined);
	}

	cut(item: SpecDocsItem): void {
		this.clipboard = { paths: [item.resourceUri.fsPath], isCut: true };
	}

	copy(item: SpecDocsItem): void {
		this.clipboard = { paths: [item.resourceUri.fsPath], isCut: false };
	}

	private async confirmOverwrite(name: string): Promise<boolean> {
		const answer = await vscode.window.showWarningMessage(
			`"${name}" already exists. Overwrite?`,
			{ modal: true },
			'Overwrite',
		);
		return answer === 'Overwrite';
	}

	private copyOrMoveFile(srcPath: string, dest: string, isCut: boolean): void {
		if (isCut) {
			fs.renameSync(srcPath, dest);
			return;
		}
		if (fs.statSync(srcPath).isDirectory()) {
			fs.cpSync(srcPath, dest, { recursive: true });
		} else {
			fs.copyFileSync(srcPath, dest);
		}
	}

	async paste(item?: SpecDocsNode): Promise<void> {
		if (!this.clipboard || this.clipboard.paths.length === 0) return;

		const destDir = this.resolveDestDir(item);
		if (!destDir) return;

		for (const srcPath of this.clipboard.paths) {
			const name = path.basename(srcPath);
			const dest = path.join(destDir, name);
			if (srcPath === dest) continue;

			if (fs.existsSync(dest) && !(await this.confirmOverwrite(name))) continue;

			try {
				this.copyOrMoveFile(srcPath, dest, this.clipboard.isCut);
			} catch (e: unknown) {
				showError(this.clipboard.isCut ? 'Move failed' : 'Copy failed', e);
			}
		}

		if (this.clipboard.isCut) {
			this.clipboard = null;
		}
		this.refresh();
	}
}
