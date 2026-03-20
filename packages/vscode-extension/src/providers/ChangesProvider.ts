import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync, execSync } from 'child_process';

const REFRESH_DEBOUNCE_MS = 500;

const enum GitStatus {
	INDEX_MODIFIED = 0,
	INDEX_ADDED = 1,
	INDEX_DELETED = 2,
	INDEX_RENAMED = 3,
	MODIFIED = 5,
	DELETED = 6,
	UNTRACKED = 7,
}

interface ParsedChange {
	filePath: string;
	absPath: string;
	status: number;
	group: 'staged' | 'changes';
}

type ChangesTreeItem = ChangesRepoItem | ChangesGroupItem | ChangesFileItem | ChangesSyncItem;

export class ChangesRepoItem extends vscode.TreeItem {
	constructor(
		public readonly gitRoot: string,
		repoName: string,
		branchName: string,
	) {
		const label = branchName ? `${repoName} / ${branchName}` : repoName;
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = 'changesRepo';
		this.iconPath = new vscode.ThemeIcon('repo');
	}
}

export class ChangesSyncItem extends vscode.TreeItem {
	constructor(ahead: number, behind: number, public readonly gitRoot?: string) {
		const parts: string[] = [];
		if (ahead > 0) { parts.push(`${ahead}↑`); }
		if (behind > 0) { parts.push(`${behind}↓`); }
		super(`Sync Changes (${parts.join(' ')})`, vscode.TreeItemCollapsibleState.None);
		this.iconPath = new vscode.ThemeIcon('sync');
		this.contextValue = 'changesSync';
		this.command = {
			command: 'anytime-markdown.syncChanges',
			title: 'Sync Changes',
			arguments: [gitRoot],
		};
	}
}

export class ChangesGroupItem extends vscode.TreeItem {
	constructor(
		public readonly group: 'staged' | 'changes',
		count: number,
		public readonly gitRoot: string,
	) {
		const label = group === 'staged' ? 'Staged Changes' : 'Changes';
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.description = `${count}`;
		this.contextValue = group === 'staged' ? 'changesGroupStaged' : 'changesGroupChanges';
		this.iconPath = new vscode.ThemeIcon(group === 'staged' ? 'check' : 'edit');
	}
}

export class ChangesFileItem extends vscode.TreeItem {
	public readonly filePath: string;
	public readonly absPath: string;
	public readonly group: 'staged' | 'changes';
	public readonly gitRoot: string;

	constructor(
		change: ParsedChange,
		gitRoot: string,
	) {
		const fileName = path.basename(change.filePath);
		super(fileName, vscode.TreeItemCollapsibleState.None);

		this.filePath = change.filePath;
		this.absPath = change.absPath;
		this.group = change.group;
		this.gitRoot = gitRoot;

		const dir = path.dirname(change.filePath);
		const statusLabel = getStatusLabel(change.status, change.group);

		this.description = dir === '.' ? statusLabel : `${dir}  ${statusLabel}`;
		this.tooltip = change.filePath;
		this.resourceUri = vscode.Uri.file(change.absPath);
		this.contextValue = change.group === 'staged' ? 'changesFileStaged' : 'changesFileUnstaged';
		this.iconPath = new vscode.ThemeIcon(
			getStatusIcon(change.status, change.group),
			getStatusColor(change.status, change.group),
		);

		const lower = fileName.toLowerCase();
		const isMd = lower.endsWith('.md') || lower.endsWith('.markdown');
		this.command = {
			command: 'anytime-markdown.changesOpenFile',
			title: 'Open Changes',
			arguments: [gitRoot, change.filePath, change.group, vscode.Uri.file(change.absPath), isMd, `${fileName} (${statusLabel})`],
		};
	}
}

function getStatusLabel(status: number, group: 'staged' | 'changes'): string {
	if (group === 'staged') {
		switch (status) {
			case GitStatus.INDEX_MODIFIED: return 'M';
			case GitStatus.INDEX_ADDED: return 'A';
			case GitStatus.INDEX_DELETED: return 'D';
			case GitStatus.INDEX_RENAMED: return 'R';
			default: return 'M';
		}
	}
	switch (status) {
		case GitStatus.MODIFIED: return 'M';
		case GitStatus.DELETED: return 'D';
		case GitStatus.UNTRACKED: return 'U';
		default: return 'M';
	}
}

function getStatusIcon(status: number, group: 'staged' | 'changes'): string {
	if (group === 'changes' && status === GitStatus.UNTRACKED) { return 'diff-added'; }
	if (group === 'changes' && status === GitStatus.DELETED) { return 'diff-removed'; }
	if (group === 'staged' && status === GitStatus.INDEX_ADDED) { return 'diff-added'; }
	if (group === 'staged' && status === GitStatus.INDEX_DELETED) { return 'diff-removed'; }
	return 'diff-modified';
}

function getStatusColor(status: number, group: 'staged' | 'changes'): vscode.ThemeColor | undefined {
	if (group === 'changes' && status === GitStatus.UNTRACKED) {
		return new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
	}
	if (group === 'changes' && status === GitStatus.DELETED) {
		return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
	}
	if (group === 'staged' && status === GitStatus.INDEX_ADDED) {
		return new vscode.ThemeColor('gitDecoration.addedResourceForeground');
	}
	if (group === 'staged' && status === GitStatus.INDEX_DELETED) {
		return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
	}
	return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
}

function parseStatusCode(code: string, group: 'staged' | 'changes'): number {
	if (group === 'staged') {
		switch (code) {
			case 'M': return GitStatus.INDEX_MODIFIED;
			case 'A': return GitStatus.INDEX_ADDED;
			case 'D': return GitStatus.INDEX_DELETED;
			case 'R': return GitStatus.INDEX_RENAMED;
			default: return GitStatus.INDEX_MODIFIED;
		}
	}
	switch (code) {
		case 'M': return GitStatus.MODIFIED;
		case 'D': return GitStatus.DELETED;
		case '?': return GitStatus.UNTRACKED;
		default: return GitStatus.MODIFIED;
	}
}

export class ChangesProvider implements vscode.TreeDataProvider<ChangesTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private gitRootEntries: { rootPath: string; gitRoot: string }[] = [];
	private watchers: vscode.FileSystemWatcher[] = [];
	private primaryGitRoot: string | null = null;
	private _mdOnlyGetter: (() => boolean) | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	get targetGitRoot(): string | null { return this.primaryGitRoot; }

	setMdOnlyGetter(getter: () => boolean): void {
		this._mdOnlyGetter = getter;
	}

	private get mdOnly(): boolean {
		return this._mdOnlyGetter ? this._mdOnlyGetter() : false;
	}

	/** マークダウン管理のルートパス一覧に基づく git リポジトリを設定 */
	setTargetRoots(rootPaths: string[]): void {
		// 既存の watcher を破棄
		for (const w of this.watchers) { w.dispose(); }
		this.watchers = [];
		this.gitRootEntries = [];

		for (const rootPath of rootPaths) {
			try {
				const gitRoot = execSync('git rev-parse --show-toplevel', { cwd: rootPath, encoding: 'utf-8' }).trim();
				// gitRoot の重複排除
				if (!this.gitRootEntries.some(e => e.gitRoot === gitRoot)) {
					this.gitRootEntries.push({ rootPath, gitRoot });
					// ファイル変更を監視して自動リフレッシュ
					const pattern = new vscode.RelativePattern(gitRoot, '**/*');
					const watcher = vscode.workspace.createFileSystemWatcher(pattern);
					const debouncedRefresh = () => {
						if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
						this.refreshTimer = setTimeout(() => this.refresh(), REFRESH_DEBOUNCE_MS);
					};
					watcher.onDidChange(debouncedRefresh);
					watcher.onDidCreate(debouncedRefresh);
					watcher.onDidDelete(debouncedRefresh);
					this.watchers.push(watcher);
				}
			} catch { /* not a git repo */ }
		}

		this.primaryGitRoot = this.gitRootEntries[0]?.gitRoot ?? null;
		this.refresh();
	}

	/** アクティブルート変更時に primary を切り替える */
	setPrimaryRoot(rootPath: string | null): void {
		if (!rootPath) {
			this.primaryGitRoot = this.gitRootEntries[0]?.gitRoot ?? null;
			return;
		}
		const entry = this.gitRootEntries.find(e => e.rootPath === rootPath);
		if (entry) {
			this.primaryGitRoot = entry.gitRoot;
		}
	}

	/** ファイルパスに対応する gitRoot を返す */
	findGitRootForPath(filePath: string): string | null {
		for (const entry of this.gitRootEntries) {
			const normalized = entry.gitRoot.endsWith(path.sep) ? entry.gitRoot : entry.gitRoot + path.sep;
			if (filePath === entry.gitRoot || filePath.startsWith(normalized)) {
				return entry.gitRoot;
			}
		}
		return this.primaryGitRoot;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	/** 変更ファイルの総数を返す（全リポジトリ合計） */
	getChangesCount(): number {
		let count = 0;
		for (const entry of this.gitRootEntries) {
			const { staged, unstaged } = this.getChanges(entry.gitRoot);
			count += staged.length + unstaged.length;
		}
		return count;
	}

	private getChanges(gitRoot: string): { staged: ParsedChange[]; unstaged: ParsedChange[] } {
		let output: string;
		try {
			output = execSync('git status --porcelain', { cwd: gitRoot, encoding: 'utf-8' });
		} catch {
			return { staged: [], unstaged: [] };
		}

		const staged: ParsedChange[] = [];
		const unstaged: ParsedChange[] = [];

		for (const line of output.split('\n')) {
			if (!line || line.length < 4) continue;
			const x = line[0]; // index status
			const y = line[1]; // working tree status
			const filePath = line.substring(3).trim();

			if (x !== ' ' && x !== '?') {
				staged.push({
					filePath,
					absPath: path.join(gitRoot, filePath),
					status: parseStatusCode(x, 'staged'),
					group: 'staged',
				});
			}
			if (y !== ' ' || x === '?') {
				unstaged.push({
					filePath,
					absPath: path.join(gitRoot, filePath),
					status: x === '?' ? parseStatusCode('?', 'changes') : parseStatusCode(y, 'changes'),
					group: 'changes',
				});
			}
		}

		return { staged, unstaged };
	}

	/** リモートとの差分（ahead/behind）を取得 */
	private getSyncInfo(gitRoot: string): { ahead: number; behind: number } {
		let ahead = 0;
		let behind = 0;
		try {
			const aheadOut = execSync('git rev-list @{u}..HEAD --count', { cwd: gitRoot, encoding: 'utf-8' }).trim();
			ahead = parseInt(aheadOut, 10) || 0;
		} catch { /* no upstream or error */ }
		try {
			const behindOut = execSync('git rev-list HEAD..@{u} --count', { cwd: gitRoot, encoding: 'utf-8' }).trim();
			behind = parseInt(behindOut, 10) || 0;
		} catch { /* no upstream or error */ }
		return { ahead, behind };
	}

	/** gitRoot のリポジトリ名とブランチ名を取得 */
	private getRepoInfo(gitRoot: string): { repoName: string; branchName: string } {
		const repoName = path.basename(gitRoot);
		let branchName = '';
		try {
			branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot, encoding: 'utf-8' }).trim();
		} catch { /* ignore */ }
		return { repoName, branchName };
	}

	getTreeItem(element: ChangesTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: ChangesTreeItem): Promise<ChangesTreeItem[]> {
		if (this.gitRootEntries.length === 0) { return []; }

		if (!element) {
			if (this.gitRootEntries.length === 1) {
				// 単一リポジトリ: フラット表示
				return this.getGroupItems(this.gitRootEntries[0].gitRoot);
			}
			// 複数リポジトリ: リポジトリノードを表示
			return this.gitRootEntries.map(entry => {
				const info = this.getRepoInfo(entry.gitRoot);
				return new ChangesRepoItem(entry.gitRoot, info.repoName, info.branchName);
			});
		}

		if (element instanceof ChangesRepoItem) {
			return this.getGroupItems(element.gitRoot);
		}

		if (element instanceof ChangesGroupItem) {
			const { staged, unstaged } = this.getChanges(element.gitRoot);
			let changes = element.group === 'staged' ? staged : unstaged;
			if (this.mdOnly) {
				changes = changes.filter(c => { const l = c.filePath.toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); });
			}
			return changes.map(c => new ChangesFileItem(c, element.gitRoot));
		}

		return [];
	}

	private getGroupItems(gitRoot: string): ChangesTreeItem[] {
		const { staged, unstaged } = this.getChanges(gitRoot);
		const filterFn = this.mdOnly
			? (c: ParsedChange) => { const l = c.filePath.toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); }
			: () => true;
		const filteredStaged = staged.filter(filterFn);
		const filteredUnstaged = unstaged.filter(filterFn);
		const items: ChangesTreeItem[] = [];
		if (filteredStaged.length > 0) {
			items.push(new ChangesGroupItem('staged', filteredStaged.length, gitRoot));
		}
		if (filteredUnstaged.length > 0) {
			items.push(new ChangesGroupItem('changes', filteredUnstaged.length, gitRoot));
		}
		// ローカル変更がない場合、リモートとの差分を表示
		if (items.length === 0) {
			const { ahead, behind } = this.getSyncInfo(gitRoot);
			if (ahead > 0 || behind > 0) {
				items.push(new ChangesSyncItem(ahead, behind, gitRoot));
			}
		}
		return items;
	}

	async stageFile(item: ChangesFileItem): Promise<void> {
		try {
			execFileSync('git', ['add', item.filePath], { cwd: item.gitRoot });
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Stage failed: ${msg}`);
		}
	}

	async unstageFile(item: ChangesFileItem): Promise<void> {
		try {
			execFileSync('git', ['reset', 'HEAD', item.filePath], { cwd: item.gitRoot });
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Unstage failed: ${msg}`);
		}
	}

	async commit(gitRoot?: string): Promise<void> {
		const target = gitRoot ?? this.primaryGitRoot;
		if (!target) {
			vscode.window.showWarningMessage('No Git repository found.');
			return;
		}
		const { staged } = this.getChanges(target);
		if (staged.length === 0) {
			vscode.window.showWarningMessage('No staged changes to commit.');
			return;
		}
		const message = await vscode.window.showInputBox({
			prompt: 'Commit message',
			placeHolder: 'Enter commit message',
		});
		if (!message) return;
		try {
			execFileSync('git', ['commit', '-m', message], { cwd: target });
			vscode.window.showInformationMessage(`Committed: ${message}`);
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Commit failed: ${msg}`);
		}
	}

	async push(gitRoot?: string): Promise<void> {
		const target = gitRoot ?? this.primaryGitRoot;
		if (!target) {
			vscode.window.showWarningMessage('No Git repository found.');
			return;
		}
		try {
			execSync('git push', { cwd: target });
			vscode.window.showInformationMessage('Push completed.');
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Push failed: ${msg}`);
		}
	}

	async sync(gitRoot?: string): Promise<void> {
		const target = gitRoot ?? this.primaryGitRoot;
		if (!target) { return; }
		try {
			const { ahead, behind } = this.getSyncInfo(target);
			if (behind > 0) {
				execSync('git pull', { cwd: target });
			}
			if (ahead > 0) {
				execSync('git push', { cwd: target });
			}
			vscode.window.showInformationMessage('Sync completed.');
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Sync failed: ${msg}`);
		}
	}

	async discardChanges(item: ChangesFileItem): Promise<void> {
		const answer = await vscode.window.showWarningMessage(
			`Are you sure you want to discard changes in "${path.basename(item.filePath)}"?`,
			{ modal: true },
			'Discard',
		);
		if (answer !== 'Discard') { return; }
		try {
			// untracked ファイルは git 管理外なので直接削除
			const isUntracked = item.group === 'changes' &&
				fs.existsSync(item.absPath) &&
				(() => { try { execFileSync('git', ['ls-files', '--error-unmatch', item.filePath], { cwd: item.gitRoot, stdio: 'pipe' }); return false; } catch { return true; } })();
			if (isUntracked) {
				fs.unlinkSync(item.absPath);
			} else {
				execFileSync('git', ['checkout', '--', item.filePath], { cwd: item.gitRoot });
			}
			await this.closeTab(item.absPath);
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Discard failed: ${msg}`);
		}
	}

	/** 指定パスのファイルタブを閉じる */
	private async closeTab(absPath: string): Promise<void> {
		const uri = vscode.Uri.file(absPath);
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const input = tab.input;
				if (input && typeof input === 'object' && 'uri' in input) {
					const tabUri = (input as { uri: vscode.Uri }).uri;
					if (tabUri.fsPath === uri.fsPath) {
						await vscode.window.tabGroups.close(tab);
						return;
					}
				}
			}
		}
	}

	/** 変更一覧から消えたファイルのタブを閉じる */
	async closeRemovedTabs(previousPaths: Set<string>): Promise<void> {
		const currentPaths = this.getChangedPaths();
		for (const p of previousPaths) {
			if (!currentPaths.has(p)) {
				await this.closeTab(p);
			}
		}
	}

	/** 現在の変更ファイルパス一覧を返す（全リポジトリ） */
	getChangedPaths(): Set<string> {
		const paths = new Set<string>();
		for (const entry of this.gitRootEntries) {
			const { staged, unstaged } = this.getChanges(entry.gitRoot);
			for (const c of staged) { paths.add(c.absPath); }
			for (const c of unstaged) { paths.add(c.absPath); }
		}
		return paths;
	}

	dispose(): void {
		for (const w of this.watchers) { w.dispose(); }
		if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
	}
}
