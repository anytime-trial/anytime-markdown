import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { GitLogger } from '../utils/GitLogger';
import {
	SpecDocsRootItem, SpecDocsItem, SpecDocsDragAndDrop,
	isMarkdownFile, findGitDir, readGitBranch,
} from './specdocs/types';
import type { SpecDocsNode } from './specdocs/types';
import * as FileOps from './specdocs/SpecDocsFileOps';
import type { Clipboard, SpecDocsFileOpsHost } from './specdocs/SpecDocsFileOps';
import * as GitOps from './specdocs/SpecDocsGitOps';
import type { SpecDocsGitOpsHost } from './specdocs/SpecDocsGitOps';

export { SpecDocsRootItem, SpecDocsItem, SpecDocsDragAndDrop } from './specdocs/types';
export type { SpecDocsNode } from './specdocs/types';

const STORAGE_KEY = 'anytimeGit.specDocsRoot';
const STORAGE_KEY_MULTI = 'anytimeGit.specDocsRoots';
const MD_ONLY_KEY = 'anytimeGit.mdOnly';
const REFRESH_DEBOUNCE_MS = 300;

export class SpecDocsProvider implements vscode.TreeDataProvider<SpecDocsNode>, SpecDocsFileOpsHost, SpecDocsGitOpsHost {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<SpecDocsNode | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private rootPaths: string[] = [];
	private _mdOnly: boolean;
	private clipboard: Clipboard | null = null;
	private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	readonly context: vscode.ExtensionContext;

	constructor(ctx: vscode.ExtensionContext) {
		this.context = ctx;
		// マイグレーション: 旧 string → 新 string[]
		const savedMulti = ctx.globalState.get<string[]>(STORAGE_KEY_MULTI);
		if (savedMulti) {
			this.rootPaths = savedMulti.filter(p => fs.existsSync(p));
		} else {
			const savedSingle = ctx.globalState.get<string>(STORAGE_KEY);
			if (savedSingle && fs.existsSync(savedSingle)) {
				this.rootPaths = [savedSingle];
			}
		}
		this._mdOnly = ctx.globalState.get<boolean>(MD_ONLY_KEY, true);
		for (const rootPath of this.rootPaths) {
			this.setupWatcher(rootPath);
		}
		this.initAsync();
	}

	private setupWatcher(rootPath: string): void {
		if (this.watchers.has(rootPath)) return;
		const pattern = new vscode.RelativePattern(rootPath, '**/*');
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);
		const debouncedRefresh = () => {
			if (this.refreshTimer) clearTimeout(this.refreshTimer);
			this.refreshTimer = setTimeout(() => this._onDidChangeTreeData.fire(undefined), REFRESH_DEBOUNCE_MS);
		};
		watcher.onDidCreate(debouncedRefresh);
		watcher.onDidDelete(debouncedRefresh);
		this.watchers.set(rootPath, watcher);
	}

	private disposeWatcher(rootPath: string): void {
		const watcher = this.watchers.get(rootPath);
		if (watcher) {
			watcher.dispose();
			this.watchers.delete(rootPath);
		}
	}

	dispose(): void {
		for (const watcher of this.watchers.values()) {
			watcher.dispose();
		}
		this.watchers.clear();
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
		} catch (err) { GitLogger.error('Failed to read directory', err); }
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

	// --- Folder management ---

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
		this.setupWatcher(dirPath);
		this.saveRootPaths();
		this._onDidChangeTreeData.fire(undefined);
	}

	removeRoot(rootPath: string): void {
		const idx = this.rootPaths.indexOf(rootPath);
		if (idx === -1) return;
		this.rootPaths.splice(idx, 1);
		this.disposeWatcher(rootPath);
		this.saveRootPaths();
		this._onDidChangeTreeData.fire(undefined);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	fireTreeDataChange(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	// --- File Operations (delegated) ---

	async createFile(item?: SpecDocsNode): Promise<void> { return FileOps.createFile(this, item); }
	async deleteItem(item: SpecDocsItem): Promise<void> { return FileOps.deleteItem(this, item); }
	async renameItem(item: SpecDocsItem): Promise<void> { return FileOps.renameItem(this, item); }
	async createFolder(item?: SpecDocsNode): Promise<void> { return FileOps.createFolder(this, item); }
	async importFiles(item?: SpecDocsNode): Promise<void> { return FileOps.importFiles(this, item); }

	toggleMdOnly(): void {
		this._mdOnly = !this._mdOnly;
		this.context.globalState.update(MD_ONLY_KEY, this._mdOnly);
		vscode.commands.executeCommand('setContext', 'anytimeGit.mdOnly', this._mdOnly);
		this._onDidChangeTreeData.fire(undefined);
	}

	cut(item: SpecDocsItem): void {
		this.clipboard = FileOps.cut(item);
	}

	copy(item: SpecDocsItem): void {
		this.clipboard = FileOps.copy(item);
	}

	async paste(item?: SpecDocsNode): Promise<void> {
		this.clipboard = await FileOps.paste(this, this.clipboard, item);
	}

	// --- Git Operations (delegated) ---

	async cloneRepository(): Promise<void> { return GitOps.cloneRepository(this); }
	async switchBranch(rootPath?: string): Promise<void> { return GitOps.switchBranch(this, rootPath); }
}
