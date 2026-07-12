import * as cp from 'node:child_process';
import * as vscode from 'vscode';
import { ClaudeStatusWatcher, ClaudeUsageClient, jstDateString } from '@anytime-markdown/vscode-common';
import type { AgentInfo, ClaudeUsageResult, CodexSessionScanner, UsageLimitRow } from '@anytime-markdown/vscode-common';
import { buildAgentMapping, groupByWorkspace, parseWorktreeList, resolveSessionWorkspacePath } from '@anytime-markdown/agent-core';
import type { WorktreeEntry, SessionMapping, AgentSource } from '@anytime-markdown/agent-core';
import { SessionTreeItem, SourceGroupItem, TodaySummaryItem, UsageGroupItem, UsageLimitItem, WorkspaceGroupItem } from './AgentMappingItem';
import { AgentLogger } from '../utils/AgentLogger';

type AgentMappingItem = SessionTreeItem | SourceGroupItem | WorkspaceGroupItem | TodaySummaryItem | UsageGroupItem | UsageLimitItem;

const WORKTREE_CACHE_TTL_MS = 30_000;
/** Codex は getChildren 時読みのため、Claude 無活動でも定期 refresh で更新する（scanner TTL 相当）。 */
const CODEX_REFRESH_INTERVAL_MS = 15_000;
const DEFAULT_USAGE_REFRESH_SECONDS = 120;
const MIN_USAGE_REFRESH_SECONDS = 30;
const SECONDS_TO_MS = 1000;

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
  private _usageTimer: ReturnType<typeof setInterval> | null = null;
  private _usageRows: readonly UsageLimitRow[] | null = null;
  private _usageStatus: 'hidden' | 'fresh' | 'stale' | 'expired' = 'hidden';
  private readonly _configListener: vscode.Disposable;
  private readonly _warnedUsageKinds = new Set<string>();

  constructor(
    private readonly watcher: ClaudeStatusWatcher,
    private readonly gitRoot: string,
    private readonly codexScanner?: CodexSessionScanner,
    private readonly iconBaseUri?: vscode.Uri,
    private readonly usageClient = new ClaudeUsageClient(),
  ) {
    watcher.onMultiStatusChange(() => this.refresh());
    if (this.codexScanner) {
      this._codexTimer = setInterval(() => {
        if (this._showCodexSessions()) {
          this.refresh();
        }
      }, CODEX_REFRESH_INTERVAL_MS);
    }
    this._startUsageRefresh();
    // 設定は起動時にしか読まないため、on にしてもリロードするまで取得が始まらない。変更を購読して張り直す。
    this._configListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('anytimeAgent.showUsage') ||
        e.affectsConfiguration('anytimeAgent.usageRefreshSeconds')
      ) {
        this._restartUsageRefresh();
      }
    });
  }

  private _restartUsageRefresh(): void {
    if (this._usageTimer !== null) {
      clearInterval(this._usageTimer);
      this._usageTimer = null;
    }
    this._usageRows = null;
    this._usageStatus = 'hidden';
    this._startUsageRefresh();
    this.refresh();
  }

  private _showCodexSessions(): boolean {
    return vscode.workspace
      .getConfiguration('anytimeAgent')
      .get<boolean>('showCodexSessions', true);
  }

  private _showUsage(): boolean {
    return vscode.workspace
      .getConfiguration('anytimeAgent')
      .get<boolean>('showUsage', true);
  }

  private _usageRefreshMs(): number {
    const seconds = vscode.workspace
      .getConfiguration('anytimeAgent')
      .get<number>('usageRefreshSeconds', DEFAULT_USAGE_REFRESH_SECONDS);
    const clamped = typeof seconds === 'number' && Number.isFinite(seconds)
      ? Math.max(MIN_USAGE_REFRESH_SECONDS, seconds)
      : DEFAULT_USAGE_REFRESH_SECONDS;
    return clamped * SECONDS_TO_MS;
  }

  private _startUsageRefresh(): void {
    if (!this._showUsage()) {
      return;
    }
    void this._refreshUsage();
    this._usageTimer = setInterval(() => {
      void this._refreshUsage();
    }, this._usageRefreshMs());
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
    if (element instanceof SourceGroupItem || element instanceof WorkspaceGroupItem || element instanceof UsageGroupItem) {
      return [...element.children];
    }
    if (element !== undefined) {
      return []; // TodaySummaryItem / SessionTreeItem は葉。
    }
    return this._buildRoot();
  }

  /** ルート: [Claude グループ, Codex グループ]。Claude グループは Today / Usage の受け皿として空でも出す。 */
  private _buildRoot(): AgentMappingItem[] {
    const worktrees = this._getWorktreesCached();
    const claudeAgents = [...this.watcher.getAllAgents().values()];
    const codexAgents = this._scanCodexAgents(worktrees);

    // Claude/Codex 双方を buildAgentMapping に通し worktree hover を得てから source で振り分ける。
    const entries = this._toEntries(buildAgentMapping([...claudeAgents, ...codexAgents], worktrees));

    const todayStats = this.watcher.getTodayStats();
    const commitCount = this._getTodayCommitCountCached();
    const today = new TodaySummaryItem(todayStats, commitCount);
    const root: AgentMappingItem[] = [];

    const claudeGroup = this._buildGroup('claude', entries, [this._buildUsageGroup(), today].filter((item): item is UsageGroupItem | TodaySummaryItem => item !== null));
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

  /** ソース見出し配下をワークスペース単位でまとめる。Codex のみセッション 0 件なら見出しごと出さない。 */
  private _buildGroup(
    source: AgentSource,
    entries: readonly SessionEntry[],
    leadingChildren: readonly (UsageGroupItem | TodaySummaryItem)[] = [],
  ): SourceGroupItem | null {
    const ofSource = entries.filter(e => e.session.source === source);
    if (source === 'codex' && ofSource.length === 0) {
      return null;
    }
    const workspaces = groupByWorkspace(
      ofSource,
      e => e.workspacePath,
      e => e.session.ageSeconds,
    ).map(g => new WorkspaceGroupItem(
      g.workspacePath,
      g.items.map(e => new SessionTreeItem(e.session, {
        branch: e.branch,
        worktreeName: e.worktreeName,
        workspacePath: g.workspacePath,
      })),
    ));
    return new SourceGroupItem(source, [...leadingChildren, ...workspaces], this.iconBaseUri);
  }

  private _buildUsageGroup(): UsageGroupItem | null {
    if (!this._showUsage() || this._usageStatus === 'hidden') {
      return null;
    }
    if (this._usageStatus === 'expired') {
      return new UsageGroupItem([UsageLimitItem.expired()], [], { expired: true });
    }
    if (this._usageRows === null) {
      return null;
    }
    return new UsageGroupItem(
      this._usageRows.map(row => new UsageLimitItem(row)),
      this._usageRows,
      { stale: this._usageStatus === 'stale' },
    );
  }

  private async _refreshUsage(): Promise<void> {
    if (!this._showUsage()) {
      this._usageRows = null;
      this._usageStatus = 'hidden';
      return;
    }
    try {
      this._applyUsageResult(await this.usageClient.fetchUsage());
    } catch (err) {
      this._markUsageStale();
      // fetchUsage は全経路を結果型へ正規化するためここは到達しない想定だが、将来 throw する
      // 実装に変わってもトークンが Output Channel へ出ないよう、種別だけに落として記録する。
      const kind = err instanceof Error && err.name ? err.name : 'Error';
      AgentLogger.error('[AgentMapping] Claude usage refresh failed', new Error(`Unexpected ${kind}`));
    } finally {
      this.refresh();
    }
  }

  private _applyUsageResult(result: ClaudeUsageResult): void {
    if (result.kind === 'ok') {
      this._usageRows = result.rows;
      this._usageStatus = 'fresh';
      this._warnUnknownUsageKinds(result.unknownKinds);
      return;
    }
    if (result.kind === 'unauthenticated') {
      this._usageRows = null;
      this._usageStatus = 'hidden';
      return;
    }
    if (result.kind === 'expired') {
      this._usageStatus = 'expired';
      return;
    }
    this._markUsageStale();
    if (result.kind === 'rateLimited') {
      AgentLogger.warn('[AgentMapping] Claude usage request was rate limited');
      return;
    }
    AgentLogger.error('[AgentMapping] Claude usage request failed', new Error(result.message));
  }

  /**
   * 未知の枠種別（/api/oauth/usage への新種追加）を知らせる。取得は既定 120 秒周期のため、
   * 同じ kind を出し続けないよう種別ごとに 1 回だけ warn する。
   */
  private _warnUnknownUsageKinds(unknownKinds: readonly string[]): void {
    for (const kind of unknownKinds) {
      if (this._warnedUsageKinds.has(kind)) {
        continue;
      }
      this._warnedUsageKinds.add(kind);
      AgentLogger.warn(
        `[AgentMapping] Claude usage returned an unknown limit kind "${kind}" (not displayed). ` +
        'The usage API may have added a new limit type.',
      );
    }
  }

  private _markUsageStale(): void {
    this._usageStatus = this._usageRows === null ? 'hidden' : 'stale';
  }

  dispose(): void {
    if (this._codexTimer !== null) {
      clearInterval(this._codexTimer);
      this._codexTimer = null;
    }
    if (this._usageTimer !== null) {
      clearInterval(this._usageTimer);
      this._usageTimer = null;
    }
    this._configListener.dispose();
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
