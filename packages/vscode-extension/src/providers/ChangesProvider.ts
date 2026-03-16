import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

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

type ChangesTreeItem = ChangesGroupItem | ChangesFileItem;

export class ChangesGroupItem extends vscode.TreeItem {
	constructor(
		public readonly group: 'staged' | 'changes',
		count: number,
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

	constructor(
		change: ParsedChange,
		private readonly gitRoot: string,
	) {
		const fileName = path.basename(change.filePath);
		super(fileName, vscode.TreeItemCollapsibleState.None);

		this.filePath = change.filePath;
		this.absPath = change.absPath;
		this.group = change.group;

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
		if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
			this.command = {
				command: 'anytime-markdown.openChangeDiff',
				title: 'Show Changes in Anytime Markdown',
				arguments: [gitRoot, change.filePath, change.group, vscode.Uri.file(change.absPath)],
			};
		} else {
			this.command = {
				command: 'vscode.diff',
				title: 'Show Changes',
				arguments: [
					vscode.Uri.file(change.absPath),
					vscode.Uri.file(change.absPath),
					`${fileName} (${statusLabel})`,
				],
			};
		}
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

	private gitRoot: string | null = null;
	private _mdOnlyGetter: (() => boolean) | null = null;
	private watcher: vscode.FileSystemWatcher | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	setMdOnlyGetter(getter: () => boolean): void {
		this._mdOnlyGetter = getter;
	}

	private get mdOnly(): boolean {
		return this._mdOnlyGetter ? this._mdOnlyGetter() : false;
	}

	/** 仕様書管理のルートパスに基づく git リポジトリを設定 */
	setTargetRoot(rootPath: string | null): void {
		if (this.watcher) {
			this.watcher.dispose();
			this.watcher = null;
		}
		this.gitRoot = null;

		if (!rootPath) {
			this.refresh();
			return;
		}

		// git root を探す
		try {
			this.gitRoot = execSync('git rev-parse --show-toplevel', { cwd: rootPath, encoding: 'utf-8' }).trim();
		} catch {
			this.gitRoot = null;
		}

		if (this.gitRoot) {
			// ファイル変更を監視して自動リフレッシュ
			const pattern = new vscode.RelativePattern(this.gitRoot, '**/*');
			this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
			const debouncedRefresh = () => {
				if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
				this.refreshTimer = setTimeout(() => this.refresh(), 500);
			};
			this.watcher.onDidChange(debouncedRefresh);
			this.watcher.onDidCreate(debouncedRefresh);
			this.watcher.onDidDelete(debouncedRefresh);
		}

		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	private getChanges(): { staged: ParsedChange[]; unstaged: ParsedChange[] } {
		if (!this.gitRoot) { return { staged: [], unstaged: [] }; }

		let output: string;
		try {
			output = execSync('git status --porcelain', { cwd: this.gitRoot, encoding: 'utf-8' });
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
					absPath: path.join(this.gitRoot!, filePath),
					status: parseStatusCode(x, 'staged'),
					group: 'staged',
				});
			}
			if (y !== ' ' || x === '?') {
				unstaged.push({
					filePath,
					absPath: path.join(this.gitRoot!, filePath),
					status: x === '?' ? parseStatusCode('?', 'changes') : parseStatusCode(y, 'changes'),
					group: 'changes',
				});
			}
		}

		return { staged, unstaged };
	}

	getTreeItem(element: ChangesTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: ChangesTreeItem): Promise<ChangesTreeItem[]> {
		if (!this.gitRoot) { return []; }

		if (!element) {
			const { staged, unstaged } = this.getChanges();
			const filterFn = this.mdOnly
				? (c: ParsedChange) => { const l = c.filePath.toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); }
				: () => true;
			const filteredStaged = staged.filter(filterFn);
			const filteredUnstaged = unstaged.filter(filterFn);
			const items: ChangesTreeItem[] = [];
			if (filteredStaged.length > 0) {
				items.push(new ChangesGroupItem('staged', filteredStaged.length));
			}
			if (filteredUnstaged.length > 0) {
				items.push(new ChangesGroupItem('changes', filteredUnstaged.length));
			}
			return items;
		}

		if (element instanceof ChangesGroupItem) {
			const { staged, unstaged } = this.getChanges();
			let changes = element.group === 'staged' ? staged : unstaged;
			if (this.mdOnly) {
				changes = changes.filter(c => { const l = c.filePath.toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); });
			}
			return changes.map(c => new ChangesFileItem(c, this.gitRoot!));
		}

		return [];
	}

	async stageFile(item: ChangesFileItem): Promise<void> {
		if (!this.gitRoot) { return; }
		try {
			execSync(`git add "${item.filePath}"`, { cwd: this.gitRoot });
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Stage failed: ${msg}`);
		}
	}

	async unstageFile(item: ChangesFileItem): Promise<void> {
		if (!this.gitRoot) { return; }
		try {
			execSync(`git reset HEAD "${item.filePath}"`, { cwd: this.gitRoot });
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Unstage failed: ${msg}`);
		}
	}

	async commit(): Promise<void> {
		if (!this.gitRoot) {
			vscode.window.showWarningMessage('No Git repository found.');
			return;
		}
		const { staged } = this.getChanges();
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
			execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: this.gitRoot });
			vscode.window.showInformationMessage(`Committed: ${message}`);
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Commit failed: ${msg}`);
		}
	}

	async push(): Promise<void> {
		if (!this.gitRoot) {
			vscode.window.showWarningMessage('No Git repository found.');
			return;
		}
		try {
			execSync('git push', { cwd: this.gitRoot });
			vscode.window.showInformationMessage('Push completed.');
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Push failed: ${msg}`);
		}
	}

	async discardChanges(item: ChangesFileItem): Promise<void> {
		if (!this.gitRoot) { return; }
		const answer = await vscode.window.showWarningMessage(
			`Are you sure you want to discard changes in "${path.basename(item.filePath)}"?`,
			{ modal: true },
			'Discard',
		);
		if (answer !== 'Discard') { return; }
		try {
			execSync(`git checkout -- "${item.filePath}"`, { cwd: this.gitRoot });
			this.refresh();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Discard failed: ${msg}`);
		}
	}

	dispose(): void {
		if (this.watcher) { this.watcher.dispose(); }
		if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
	}
}
