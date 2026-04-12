import * as vscode from 'vscode';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { GitLogger } from '../utils/GitLogger';
import {
	ChangesRepoItem, ChangesGroupItem, ChangesFileItem, ChangesSyncItem,
} from './changes/types';
import type { ChangesTreeItem, ParsedChange } from './changes/types';
import { getChanges, getSyncInfo, getRepoInfo } from './changes/GitStatusParser';
import * as GitOps from './changes/GitOperations';
import type { GitOperationsHost } from './changes/GitOperations';

export { ChangesRepoItem, ChangesGroupItem, ChangesFileItem, ChangesSyncItem } from './changes/types';
export type { ChangesTreeItem, ParsedChange } from './changes/types';

const REFRESH_DEBOUNCE_MS = 500;

export class ChangesProvider implements vscode.TreeDataProvider<ChangesTreeItem>, GitOperationsHost {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private gitRootEntries: { rootPath: string; gitRoot: string }[] = [];
	private watchers: vscode.FileSystemWatcher[] = [];
	private _primaryGitRoot: string | null = null;
	private _mdOnlyGetter: (() => boolean) | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	get targetGitRoot(): string | null { return this._primaryGitRoot; }
	get primaryGitRoot(): string | null { return this._primaryGitRoot; }

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
				const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: rootPath, encoding: 'utf-8' }).trim();
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
			} catch (err) { GitLogger.warn(`Not a git repo: ${rootPath}`); }
		}

		this._primaryGitRoot = this.gitRootEntries[0]?.gitRoot ?? null;
		this.refresh();
	}

	/** アクティブルート変更時に primary を切り替える */
	setPrimaryRoot(rootPath: string | null): void {
		if (!rootPath) {
			this._primaryGitRoot = this.gitRootEntries[0]?.gitRoot ?? null;
			return;
		}
		const entry = this.gitRootEntries.find(e => e.rootPath === rootPath);
		if (entry) {
			this._primaryGitRoot = entry.gitRoot;
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
		return this._primaryGitRoot;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	/** 変更ファイルの総数を返す（全リポジトリ合計） */
	getChangesCount(): number {
		let count = 0;
		for (const entry of this.gitRootEntries) {
			const { staged, unstaged } = getChanges(entry.gitRoot);
			count += staged.length + unstaged.length;
		}
		return count;
	}

	getTreeItem(element: ChangesTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: ChangesTreeItem): Promise<ChangesTreeItem[]> {
		if (this.gitRootEntries.length === 0) { return []; }

		if (!element) {
			// 常にリポジトリノードを表示
			return this.gitRootEntries.map(entry => {
				const info = getRepoInfo(entry.gitRoot);
				return new ChangesRepoItem(entry.gitRoot, info.repoName, info.branchName);
			});
		}

		if (element instanceof ChangesRepoItem) {
			return this.getGroupItems(element.gitRoot);
		}

		if (element instanceof ChangesGroupItem) {
			const { staged, unstaged } = getChanges(element.gitRoot);
			let changes = element.group === 'staged' ? staged : unstaged;
			if (this.mdOnly) {
				changes = changes.filter(c => { const l = c.filePath.toLowerCase(); return l.endsWith('.md') || l.endsWith('.markdown'); });
			}
			return changes.map(c => new ChangesFileItem(c, element.gitRoot));
		}

		return [];
	}

	private getGroupItems(gitRoot: string): ChangesTreeItem[] {
		const { staged, unstaged } = getChanges(gitRoot);
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
			const { ahead, behind } = getSyncInfo(gitRoot);
			if (ahead > 0 || behind > 0) {
				items.push(new ChangesSyncItem(ahead, behind, gitRoot));
			}
		}
		return items;
	}

	// --- Git Operations (delegated) ---

	async stageFile(item: ChangesFileItem): Promise<void> { return GitOps.stageFile(this, item); }
	async unstageFile(item: ChangesFileItem): Promise<void> { return GitOps.unstageFile(this, item); }
	async stageAll(gitRoot?: string): Promise<void> { return GitOps.stageAll(this, gitRoot); }
	async unstageAll(gitRoot?: string): Promise<void> { return GitOps.unstageAll(this, gitRoot); }
	async discardAll(gitRoot?: string): Promise<void> { return GitOps.discardAll(this, gitRoot); }
	async commit(gitRoot?: string): Promise<void> { return GitOps.commit(this, gitRoot); }
	async push(gitRoot?: string): Promise<void> { return GitOps.push(this, gitRoot); }
	async sync(gitRoot?: string): Promise<void> { return GitOps.sync(this, gitRoot); }
	async discardChanges(item: ChangesFileItem): Promise<void> { return GitOps.discardChanges(this, item); }

	/** 変更一覧から消えたファイルのタブを閉じる */
	async closeRemovedTabs(previousPaths: Set<string>): Promise<void> {
		const currentPaths = this.getChangedPaths();
		return GitOps.closeRemovedTabs(currentPaths, previousPaths);
	}

	/** 現在の変更ファイルパス一覧を返す（全リポジトリ） */
	getChangedPaths(): Set<string> {
		const paths = new Set<string>();
		for (const entry of this.gitRootEntries) {
			const { staged, unstaged } = getChanges(entry.gitRoot);
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
