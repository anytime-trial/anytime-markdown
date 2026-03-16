import * as vscode from 'vscode';
import * as path from 'path';

// vscode.git 拡張機能の型定義
interface GitExtension {
	getAPI(version: 1): GitAPI;
}
interface GitAPI {
	repositories: Repository[];
	onDidOpenRepository: vscode.Event<Repository>;
}
interface Repository {
	rootUri: vscode.Uri;
	state: RepositoryState;
	onDidChange: vscode.Event<void>;
	add(resources: vscode.Uri[]): Promise<void>;
	revert(resources: vscode.Uri[]): Promise<void>;
	checkout(paths: string[]): Promise<void>;
}
interface RepositoryState {
	HEAD?: { name?: string; commit?: string };
	remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
	indexChanges: Change[];
	workingTreeChanges: Change[];
}
interface Change {
	uri: vscode.Uri;
	originalUri: vscode.Uri;
	status: number;
}

const enum GitStatus {
	INDEX_MODIFIED = 0,
	INDEX_ADDED = 1,
	INDEX_DELETED = 2,
	INDEX_RENAMED = 3,
	INDEX_COPIED = 4,
	MODIFIED = 5,
	DELETED = 6,
	UNTRACKED = 7,
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
	constructor(
		public readonly change: Change,
		public readonly group: 'staged' | 'changes',
		repoRootUri: vscode.Uri,
	) {
		const relativePath = path.relative(repoRootUri.fsPath, change.uri.fsPath).replace(/\\/g, '/');
		const fileName = path.basename(relativePath);
		super(fileName, vscode.TreeItemCollapsibleState.None);

		const dir = path.dirname(relativePath);
		const statusLabel = getStatusLabel(change.status, group);

		this.description = dir === '.' ? statusLabel : `${dir}  ${statusLabel}`;
		this.tooltip = relativePath;
		this.resourceUri = change.uri;
		this.contextValue = group === 'staged' ? 'changesFileStaged' : 'changesFileUnstaged';
		this.iconPath = new vscode.ThemeIcon(
			getStatusIcon(change.status, group),
			getStatusColor(change.status, group),
		);

		const lower = fileName.toLowerCase();
		if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
			this.command = {
				command: 'anytime-markdown.openChangeDiff',
				title: 'Show Changes in Anytime Markdown',
				arguments: [change.originalUri, change.uri],
			};
		} else {
			this.command = {
				command: 'vscode.diff',
				title: 'Show Changes',
				arguments: [change.originalUri, change.uri, `${fileName} (${statusLabel})`],
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
			case GitStatus.INDEX_COPIED: return 'C';
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

export class ChangesProvider implements vscode.TreeDataProvider<ChangesTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private disposables: vscode.Disposable[] = [];
	private repo: Repository | null = null;
	private _mdOnlyGetter: (() => boolean) | null = null;

	constructor() {
		this.initGit();
	}

	setMdOnlyGetter(getter: () => boolean): void {
		this._mdOnlyGetter = getter;
	}

	private get mdOnly(): boolean {
		return this._mdOnlyGetter ? this._mdOnlyGetter() : false;
	}

	private async initGit(): Promise<void> {
		const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
		if (!gitExtension) { return; }
		if (!gitExtension.isActive) {
			await gitExtension.activate();
		}
		const api = gitExtension.exports.getAPI(1);

		if (api.repositories.length > 0) {
			this.watchRepository(api.repositories[0]);
		} else {
			const disposable = api.onDidOpenRepository((repo) => {
				this.watchRepository(repo);
				disposable.dispose();
			});
			this.disposables.push(disposable);
		}
	}

	private watchRepository(repo: Repository): void {
		this.repo = repo;
		this.disposables.push(repo.onDidChange(() => this.refresh()));
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	/** リポジトリ名とブランチ名を返す */
	getRepoInfo(): { repoName: string; branchName: string } | null {
		if (!this.repo) { return null; }
		const branchName = this.repo.state.HEAD?.name ?? 'HEAD';
		const remote = this.repo.state.remotes.find(r => r.name === 'origin');
		const url = remote?.fetchUrl ?? remote?.pushUrl ?? '';
		const repoName = url
			? path.basename(url, '.git').replace(/\.git$/, '')
			: path.basename(this.repo.rootUri.fsPath);
		return { repoName, branchName };
	}

	getTreeItem(element: ChangesTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: ChangesTreeItem): Promise<ChangesTreeItem[]> {
		if (!this.repo) { return []; }

		if (!element) {
			const items: ChangesTreeItem[] = [];
			const filterFn = this.mdOnly
				? (c: Change) => { const l = path.basename(c.uri.fsPath).toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); }
				: () => true;
			const staged = this.repo.state.indexChanges.filter(filterFn);
			const unstaged = this.repo.state.workingTreeChanges.filter(filterFn);
			if (staged.length > 0) {
				items.push(new ChangesGroupItem('staged', staged.length));
			}
			if (unstaged.length > 0) {
				items.push(new ChangesGroupItem('changes', unstaged.length));
			}
			return items;
		}

		if (element instanceof ChangesGroupItem) {
			let changes = element.group === 'staged'
				? this.repo.state.indexChanges
				: this.repo.state.workingTreeChanges;
			if (this.mdOnly) {
				changes = changes.filter(c => { const l = path.basename(c.uri.fsPath).toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); });
			}
			return changes.map(c => new ChangesFileItem(c, element.group, this.repo!.rootUri));
		}

		return [];
	}

	async stageFile(item: ChangesFileItem): Promise<void> {
		if (!this.repo) { return; }
		await this.repo.add([item.change.uri]);
	}

	async unstageFile(item: ChangesFileItem): Promise<void> {
		if (!this.repo) { return; }
		await this.repo.revert([item.change.uri]);
	}

	async discardChanges(item: ChangesFileItem): Promise<void> {
		if (!this.repo) { return; }
		const answer = await vscode.window.showWarningMessage(
			`Are you sure you want to discard changes in "${path.basename(item.change.uri.fsPath)}"?`,
			{ modal: true },
			'Discard',
		);
		if (answer !== 'Discard') { return; }
		await this.repo.checkout([item.change.uri.fsPath]);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
