import * as cp from 'node:child_process';
import * as vscode from 'vscode';
import { ClaudeStatusWatcher, jstDateString } from '@anytime-markdown/vscode-common';
import type { AgentInfo, CodexSessionScanner } from '@anytime-markdown/vscode-common';
import { buildAgentMapping, parseWorktreeList, resolveSessionWorkspacePath } from '@anytime-markdown/agent-core';
import type { WorktreeEntry, SessionMapping, AgentSource } from '@anytime-markdown/agent-core';
import { SessionTreeItem, SourceGroupItem, TodaySummaryItem, WorkspaceGroupItem } from './AgentMappingItem';
import { AgentLogger } from '../utils/AgentLogger';

type AgentMappingItem = SessionTreeItem | SourceGroupItem | WorkspaceGroupItem | TodaySummaryItem;

const WORKTREE_CACHE_TTL_MS = 30_000;
/** Codex は getChildren 時読みのため、Claude 無活動でも定期 refresh で更新する（scanner TTL 相当）。 */
const CODEX_REFRESH_INTERVAL_MS = 15_000;

interface SessionEntry {
  readonly session: SessionMapping;
  readonly branch: string;
  readonly worktreeName: string;
  /** そのセッションが動作しているワークスペースのパス（グルーピングキー）。 */
  readonly workspacePath: string;
}

export class AgentMappingProvider
  implements vscode.TreeDataProvider<AgentMappingItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _showStale = true;
  private _cachedWorktrees: readonly WorktreeEntry[] = [];
  private _worktreeCacheExpiry = 0;
  private _commitCountCache: { count: number; expiry: number } | null = null;
  private _codexTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly watcher: ClaudeStatusWatcher,
    private readonly gitRoot: string,
    private readonly codexScanner?: CodexSessionScanner,
    private readonly iconBaseUri?: vscode.Uri,
  ) {
    watcher.onMultiStatusChange(() => this.refresh());
    if (this.codexScanner) {
      this._codexTimer = setInterval(() => {
        if (this._showCodexSessions()) {
          this.refresh();
        }
      }, CODEX_REFRESH_INTERVAL_MS);
    }
  }

  private _showCodexSessions(): boolean {
    return vscode.workspace
      .getConfiguration('anytimeAgent')
      .get<boolean>('showCodexSessions', true);
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
    // 階層: ソース見出し → ワークスペース見出し → セッション。
    if (element instanceof SourceGroupItem || element instanceof WorkspaceGroupItem) {
      return [...element.children];
    }
    if (element !== undefined) {
      return []; // TodaySummaryItem / SessionTreeItem は葉。
    }
    return this._buildRoot();
  }

  /** ルート: [Today (Claude), Claude グループ, Codex グループ]。空グループは出さない。 */
  private _buildRoot(): AgentMappingItem[] {
    const worktrees = this._getWorktreesCached();
    const claudeAgents = [...this.watcher.getAllAgents().values()];
    const codexAgents = this._scanCodexAgents(worktrees);

    // Claude/Codex 双方を buildAgentMapping に通し worktree hover を得てから source で振り分ける。
    const entries = this._toEntries(buildAgentMapping([...claudeAgents, ...codexAgents], worktrees));

    const todayStats = this.watcher.getTodayStats();
    const commitCount = this._getTodayCommitCountCached();
    const root: AgentMappingItem[] = [new TodaySummaryItem(todayStats, commitCount)];

    const claudeGroup = this._buildGroup('claude', entries);
    if (claudeGroup) root.push(claudeGroup);
    const codexGroup = this._buildGroup('codex', entries);
    if (codexGroup) root.push(codexGroup);
    return root;
  }

  private _scanCodexAgents(worktrees: readonly WorktreeEntry[]): readonly AgentInfo[] {
    if (!this.codexScanner || !this._showCodexSessions()) {
      return [];
    }
    return this.codexScanner.scan(worktrees.map(w => w.path));
  }

  private _toEntries(mappings: readonly { worktreePath: string; branch: string; worktreeName: string; sessions: readonly SessionMapping[] }[]): SessionEntry[] {
    const entries = mappings.flatMap(m =>
      m.sessions.map(session => ({
        session,
        branch: m.branch,
        worktreeName: m.worktreeName,
        workspacePath: resolveSessionWorkspacePath(m.worktreePath, session.workspacePath),
      })),
    );
    const visible = this._showStale
      ? entries
      : entries.filter(e => e.session.state !== 'stale');
    // 最近使用順（ageSeconds 昇順＝最終アクティビティが新しいものを上に）。
    return visible.sort((a, b) => a.session.ageSeconds - b.session.ageSeconds);
  }

  /** ソース見出し配下をワークスペース単位でまとめる。セッション 0 件のソースは見出しごと出さない。 */
  private _buildGroup(source: AgentSource, entries: readonly SessionEntry[]): SourceGroupItem | null {
    const ofSource = entries.filter(e => e.session.source === source);
    if (ofSource.length === 0) {
      return null;
    }
    const byWorkspace = new Map<string, SessionEntry[]>();
    for (const e of ofSource) {
      const bucket = byWorkspace.get(e.workspacePath);
      if (bucket === undefined) {
        byWorkspace.set(e.workspacePath, [e]);
      } else {
        bucket.push(e);
      }
    }
    // entries は age 昇順のため各バケット内も age 昇順。ワークスペースも最新アクティビティ順に並べる。
    const workspaces = [...byWorkspace.entries()]
      .map(([workspacePath, es]) => ({
        item: new WorkspaceGroupItem(
          workspacePath,
          es.map(e => new SessionTreeItem(e.session, { branch: e.branch, worktreeName: e.worktreeName })),
        ),
        minAge: es[0].session.ageSeconds,
      }))
      .sort((a, b) => a.minAge - b.minAge)
      .map(w => w.item);
    return new SourceGroupItem(source, workspaces, this.iconBaseUri);
  }

  dispose(): void {
    if (this._codexTimer !== null) {
      clearInterval(this._codexTimer);
      this._codexTimer = null;
    }
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
