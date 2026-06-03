import * as cp from 'node:child_process';
import * as vscode from 'vscode';
import { ClaudeStatusWatcher, jstDateString } from '@anytime-markdown/vscode-common';
import { buildAgentMapping, parseWorktreeList } from '@anytime-markdown/agent-core';
import type { WorktreeEntry, WorktreeMapping } from '@anytime-markdown/agent-core';
import { WorktreeTreeItem, SessionTreeItem, TodaySummaryItem } from './AgentMappingItem';
import { AgentLogger } from '../utils/AgentLogger';

type AgentMappingItem = WorktreeTreeItem | SessionTreeItem | TodaySummaryItem;

const WORKTREE_CACHE_TTL_MS = 30_000;

export class AgentMappingProvider
  implements vscode.TreeDataProvider<AgentMappingItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _showStale = true;
  private _cachedWorktrees: readonly WorktreeEntry[] = [];
  private _worktreeCacheExpiry = 0;
  private _commitCountCache: { count: number; expiry: number } | null = null;

  constructor(
    private readonly watcher: ClaudeStatusWatcher,
    private readonly gitRoot: string,
  ) {
    watcher.onMultiStatusChange(() => this.refresh());
  }

  get showStale(): boolean { return this._showStale; }

  toggleStale(): void {
    this._showStale = !this._showStale;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentMappingItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentMappingItem): AgentMappingItem[] {
    if (element instanceof WorktreeTreeItem) {
      const sessions = this._showStale
        ? element.mapping.sessions
        : element.mapping.sessions.filter(s => s.state !== 'stale');
      return sessions.map(s => new SessionTreeItem(s));
    }
    const agents = [...this.watcher.getAllAgents().values()];
    const worktrees = this._getWorktreesCached();
    const mappings = buildAgentMapping(agents, worktrees);
    const filtered = this._showStale
      ? mappings
      : mappings.filter(m => m.sessions.some(s => s.state !== 'stale'));

    const todayStats = this.watcher.getTodayStats();
    const commitCount = this._getTodayCommitCountCached();
    const todayItem = new TodaySummaryItem(todayStats, commitCount);

    return [todayItem, ...filtered.map(m => new WorktreeTreeItem(m))];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  cleanupStale(): void {
    void vscode.window.showInformationMessage(
      'To delete a stale status file, right-click a session node.',
    );
    this.refresh();
  }

  async deleteSessionFile(sessionId: string): Promise<boolean> {
    try {
      const ok = await this.watcher.deleteSession(sessionId);
      this.refresh();
      if (!ok) {
        void vscode.window.showWarningMessage(
          `セッションの削除に失敗しました（ワーカー未起動の可能性）: ${sessionId}`,
        );
      }
      return ok;
    } catch (err) {
      void vscode.window.showErrorMessage(
        `セッションの削除に失敗しました: ${sessionId}\n${String(err)}`,
      );
      return false;
    }
  }

  private _getTodayCommitCountCached(): number {
    const now = Date.now();
    if (this._commitCountCache && now < this._commitCountCache.expiry) {
      return this._commitCountCache.count;
    }
    const count = this._fetchTodayCommitCount();
    this._commitCountCache = { count, expiry: now + 60_000 };
    return count;
  }

  private _fetchTodayCommitCount(): number {
    try {
      const after = `${jstDateString()}T00:00:00+09:00`;
      const output = cp.execSync(
        `git log --after="${after}" --format="%H"`,
        { cwd: this.gitRoot, encoding: 'utf-8', timeout: 5000 },
      );
      return output.trim().split('\n').filter(Boolean).length;
    } catch (err) {
      AgentLogger.warn(`[AgentMapping] git log failed at ${this.gitRoot}: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

  private _getWorktreesCached(): readonly WorktreeEntry[] {
    const now = Date.now();
    if (now < this._worktreeCacheExpiry) {
      return this._cachedWorktrees;
    }
    this._cachedWorktrees = this._fetchWorktrees();
    this._worktreeCacheExpiry = now + WORKTREE_CACHE_TTL_MS;
    return this._cachedWorktrees;
  }

  private _fetchWorktrees(): readonly WorktreeEntry[] {
    try {
      const output = cp.execSync('git worktree list --porcelain', {
        cwd: this.gitRoot,
        encoding: 'utf-8',
        timeout: 5000,
      });
      return parseWorktreeList(output);
    } catch (err) {
      AgentLogger.warn(`[AgentMapping] git worktree list failed at ${this.gitRoot}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}
