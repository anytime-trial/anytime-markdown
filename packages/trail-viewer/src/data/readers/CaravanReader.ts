import type { DriftHistoryPoint } from '@anytime-markdown/trail-activity';
import type {
  CaravanBugCausalInfo,
  CaravanBugHistoryRow,
  CaravanDriftEventDetail,
  CaravanDriftEventRow,
  CaravanFailedItemRow,
  CaravanFlightReviewFindingCountRow,
  CaravanFlightReviewFindingRow,
  CaravanInvalidationRow,
  CaravanPipelineRunLogRow,
  CaravanPipelineRunRow,
  CaravanPipelineRunStatsByDayRow,
  CaravanRecurringBugRow,
  CaravanReviewHistoryRow,
  CaravanUnaddressedReviewFindingRow,
} from '../types';

export class CaravanReader {
  constructor(private readonly serverUrl: string) {}

  async probe(): Promise<boolean> {
    try {
      const res = await fetch(`${this.serverUrl}/api/caravan/status`);
      if (!res.ok) return false;
      const body = await res.json() as { exists: boolean };
      return body.exists === true;
    } catch {
      return false;
    }
  }

  async listDriftEvents(params: {
    unresolvedOnly?: boolean;
    severity?: string;
    driftType?: string;
    since?: string;
    /** ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanDriftEventRow[]> {
    const q = new URLSearchParams();
    if (params.unresolvedOnly !== undefined) q.set('unresolvedOnly', String(params.unresolvedOnly));
    if (params.severity) q.set('severity', params.severity);
    if (params.driftType) q.set('driftType', params.driftType);
    if (params.since) q.set('since', params.since);
    if (params.workspace) q.set('workspace', params.workspace);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanDriftEventRow[]>(`/api/caravan/drift/events?${q}`);
  }

  /** Phase 6 S5-C: ドリフト件数の日次推移（JST 境界・0 埋め済み） */
  async getDriftHistoryByDay(params: {
    since?: string;
    until?: string;
    driftType?: string;
    severity?: string;
  } = {}): Promise<readonly DriftHistoryPoint[]> {
    const q = new URLSearchParams();
    if (params.since) q.set('since', params.since);
    if (params.until) q.set('until', params.until);
    if (params.driftType) q.set('driftType', params.driftType);
    if (params.severity) q.set('severity', params.severity);
    const body = await this.fetchJson<{ points: DriftHistoryPoint[] }>(`/api/caravan/drift/by-day?${q}`);
    return body?.points ?? [];
  }

  async getDriftEventDetail(eventId: string): Promise<CaravanDriftEventDetail | null> {
    try {
      const res = await fetch(`${this.serverUrl}/api/caravan/drift/events/${encodeURIComponent(eventId)}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return await res.json() as CaravanDriftEventDetail;
    } catch {
      return null;
    }
  }

  async resolveDriftEvent(eventId: string, resolutionNote: string): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(
        `${this.serverUrl}/api/caravan/drift/events/${encodeURIComponent(eventId)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolutionNote }),
        },
      );
      if (!res.ok) return { ok: false };
      return await res.json() as { ok: boolean };
    } catch {
      return { ok: false };
    }
  }

  async listRecurringBugs(params: {
    pkg?: string;
    windowDays?: number;
    /** ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanRecurringBugRow[]> {
    const q = new URLSearchParams();
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.windowDays !== undefined) q.set('windowDays', String(params.windowDays));
    if (params.workspace) q.set('workspace', params.workspace);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanRecurringBugRow[]>(`/api/caravan/bugs/recurring?${q}`);
  }

  async getBugHistory(params: {
    pkg?: string;
    filePath?: string;
    category?: string;
    /**
     * 指示に属するセッションで絞る。空配列は「該当 0 件」としてサーバへ伝える
     * （パラメータを落とすと絞り込み無しになり、全バグが 1 指示の成果に見える）。
     */
    sessionIds?: readonly string[];
    /** ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanBugHistoryRow[]> {
    const q = new URLSearchParams();
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.filePath) q.set('filePath', params.filePath);
    if (params.category) q.set('category', params.category);
    if (params.sessionIds !== undefined) q.set('sessionIds', params.sessionIds.join(','));
    if (params.workspace) q.set('workspace', params.workspace);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanBugHistoryRow[]>(`/api/caravan/bugs/history?${q}`);
  }

  /**
   * `getBugHistory` の失敗を投げる版。
   *
   * `fetchJson` は取得失敗を空配列で返すため、呼び出し側からは「0 件」と「取れなかった」が
   * 区別できない。Flight Record の詳細ペインは障害を実績 0 件として見せてはならないので、
   * こちらを使って失敗を表に出す。既存パネルの空表示の挙動は変えない。
   */
  async getBugHistoryStrict(params: {
    pkg?: string;
    category?: string;
    sessionIds?: readonly string[];
    /** ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanBugHistoryRow[]> {
    const q = new URLSearchParams();
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.category) q.set('category', params.category);
    if (params.sessionIds !== undefined) q.set('sessionIds', params.sessionIds.join(','));
    if (params.workspace) q.set('workspace', params.workspace);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    const res = await fetch(`${this.serverUrl}/api/caravan/bugs/history?${q}`);
    if (!res.ok) throw new Error(`GET /api/caravan/bugs/history failed: ${res.status}`);
    return await res.json() as CaravanBugHistoryRow[];
  }

  async getBugCausalInfo(bugEntityId: string): Promise<CaravanBugCausalInfo | null> {
    const q = new URLSearchParams({ bugEntityId });
    try {
      return await this.fetchJson<CaravanBugCausalInfo | null>(`/api/caravan/bugs/causal?${q}`);
    } catch {
      return null;
    }
  }

  async listUnaddressedReviewFindings(params: {
    category?: string;
    severity?: string;
    daysSinceMin?: number;
    limit?: number;
  } = {}): Promise<readonly CaravanUnaddressedReviewFindingRow[]> {
    const q = new URLSearchParams();
    if (params.category) q.set('category', params.category);
    if (params.severity) q.set('severity', params.severity);
    if (params.daysSinceMin !== undefined) q.set('daysSinceMin', String(params.daysSinceMin));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanUnaddressedReviewFindingRow[]>(`/api/caravan/reviews/unaddressed?${q}`);
  }

  async getReviewHistory(params: {
    targetFilePath?: string;
    pkg?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanReviewHistoryRow[]> {
    const q = new URLSearchParams();
    if (params.targetFilePath) q.set('targetFilePath', params.targetFilePath);
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanReviewHistoryRow[]>(`/api/caravan/reviews/history?${q}`);
  }

  /** 指示単位の指摘件数。一覧の列に出すため、件数は専用の集計ルートから取る。 */
  async getFlightReviewFindingCounts(): Promise<readonly CaravanFlightReviewFindingCountRow[]> {
    return this.fetchJson<CaravanFlightReviewFindingCountRow[]>('/api/caravan/reviews/flight-counts');
  }

  async getFlightReviewFindings(params: {
    instructionIds?: readonly string[];
    limit?: number;
  } = {}): Promise<readonly CaravanFlightReviewFindingRow[]> {
    const q = new URLSearchParams();
    if (params.instructionIds && params.instructionIds.length > 0) {
      q.set('instructionIds', params.instructionIds.join(','));
    }
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanFlightReviewFindingRow[]>(`/api/caravan/reviews/flight-findings?${q}`);
  }

  async listPipelineRunStatsByDay(params: {
    scope?: string;
    since?: string;
  } = {}): Promise<readonly CaravanPipelineRunStatsByDayRow[]> {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.since) q.set('since', params.since);
    return this.fetchJson<CaravanPipelineRunStatsByDayRow[]>(`/api/caravan/pipeline/runs/by-day?${q}`);
  }

  async listPipelineRuns(params: {
    since?: string;
    wave?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanPipelineRunRow[]> {
    const q = new URLSearchParams();
    if (params.since) q.set('since', params.since);
    if (params.wave) q.set('wave', params.wave);
    if (params.status) q.set('status', params.status);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanPipelineRunRow[]>(`/api/caravan/pipeline/runs?${q}`);
  }

  async listPipelineRunLogs(params: {
    runId: string;
    limit?: number;
  }): Promise<readonly CaravanPipelineRunLogRow[]> {
    const q = new URLSearchParams();
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanPipelineRunLogRow[]>(`/api/caravan/pipeline/runs/${encodeURIComponent(params.runId)}/logs?${q}`);
  }

  async listFailedItems(params: {
    scope?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanFailedItemRow[]> {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanFailedItemRow[]>(`/api/caravan/pipeline/failed?${q}`);
  }

  /**
   * エッジ無効化履歴。現在は描画するパネルが無いが、グラフ表示（失効エッジの重畳・
   * 時点指定）で必要になるためデータ経路として残す。
   */
  async listInvalidations(params: {
    since?: string;
    limit?: number;
  } = {}): Promise<readonly CaravanInvalidationRow[]> {
    const q = new URLSearchParams();
    if (params.since) q.set('since', params.since);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<CaravanInvalidationRow[]>(`/api/caravan/edges/invalidations?${q}`);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    try {
      const res = await fetch(`${this.serverUrl}${path}`);
      if (!res.ok) return [] as unknown as T;
      return await res.json() as T;
    } catch {
      return [] as unknown as T;
    }
  }
}
