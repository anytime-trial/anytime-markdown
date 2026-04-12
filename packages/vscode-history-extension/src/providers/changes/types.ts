import * as vscode from 'vscode';
import * as path from 'node:path';

export const enum GitStatus {
	INDEX_MODIFIED = 0,
	INDEX_ADDED = 1,
	INDEX_DELETED = 2,
	INDEX_RENAMED = 3,
	MODIFIED = 5,
	DELETED = 6,
	UNTRACKED = 7,
}

export interface ParsedChange {
	filePath: string;
	absPath: string;
	status: number;
	group: 'staged' | 'changes';
}

export type ChangesTreeItem = ChangesRepoItem | ChangesGroupItem | ChangesFileItem | ChangesSyncItem;

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
			command: 'anytime-history.syncChanges',
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
			command: 'anytime-history.changesOpenFile',
			title: 'Open Changes',
			arguments: [gitRoot, change.filePath, change.group, vscode.Uri.file(change.absPath), isMd, `${fileName} (${statusLabel})`],
		};
	}
}

export function getStatusLabel(status: number, group: 'staged' | 'changes'): string {
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

export function getStatusIcon(status: number, group: 'staged' | 'changes'): string {
	if (group === 'changes' && status === GitStatus.UNTRACKED) { return 'diff-added'; }
	if (group === 'changes' && status === GitStatus.DELETED) { return 'diff-removed'; }
	if (group === 'staged' && status === GitStatus.INDEX_ADDED) { return 'diff-added'; }
	if (group === 'staged' && status === GitStatus.INDEX_DELETED) { return 'diff-removed'; }
	return 'diff-modified';
}

export function getStatusColor(status: number, group: 'staged' | 'changes'): vscode.ThemeColor | undefined {
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

export function parseStatusCode(code: string, group: 'staged' | 'changes'): number {
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
