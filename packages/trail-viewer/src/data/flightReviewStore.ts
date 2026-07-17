/**
 * flightReviewStore — Phase 6 S3。Flight Review 一覧・詳細・手動訂正の状態管理（vanilla store）。
 *
 * API surface:
 *   createFlightReviewStore(serverUrl, options?) → FlightReviewStore
 *   store.getState()   → FlightReviewViewState
 *   store.subscribe(listener) → unsubscribe fn
 *   store.dispose()    → ポーリング停止・in-flight fetch の中断
 *
 * 設計の要点:
 *   - サーバー不達（loadFailed）と 0 件（空配列）を区別する（emergencyStore の unknown 原則）。
 *   - 編集中（editing=true）はポーリング結果を反映しない — 再取得が訂正フォームの入力を
 *     消さないため（要件 §17 pre-mortem「ポーリングと編集の競合」）。
 */

export type FlightReviewOutcome = 'achieved' | 'partial' | 'unachieved' | 'unknown';

export type FlightReviewOutcomeSource = 'machine' | 'self' | 'manual';

/** Rationale Audit の監査ステータス（Phase 6 S4）。 */
export type RationaleAuditStatusDto = 'unaudited' | 'valid' | 'needs_fix' | 'rejected';

/** GET /api/memory/rationale の 1 行（コミット紐付き決定根拠ノード・読み取り専用）。 */
export interface RationaleNodeDto {
  readonly commitHash: string;
  readonly summary: string;
  readonly confidenceLabel: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  readonly createdAt: string;
}

/** GET /api/trail/flight-reviews の 1 行（trail-core FlightReview のワイヤ形）。 */
export interface FlightReviewDto {
  readonly id: number;
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly startedAt: string | null;
  readonly endedAt: string;
  readonly durationSeconds: number | null;
  readonly outcome: FlightReviewOutcome;
  readonly outcomeSource: FlightReviewOutcomeSource;
  readonly toolCallCount: number;
  readonly toolFailureCount: number;
  readonly reworkCount: number;
  /** JSON 配列文字列 */
  readonly unresolvedItems: string;
  /** JSON 配列文字列 */
  readonly nextConcerns: string;
  /** JSON 配列文字列（LessonCandidate[]） */
  readonly lessonCandidates: string;
  /** JSON 配列文字列 */
  readonly tags: string;
  readonly notes: string;
  readonly rationaleAuditStatus: RationaleAuditStatusDto;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** GET /api/trail/user-feedback の 1 行。 */
export interface UserFeedbackDto {
  readonly id: number;
  readonly sessionId: string;
  readonly occurredAt: string;
  readonly promptExcerpt: string;
  readonly matchedPattern: string;
  readonly createdAt: string;
}

export interface FlightReviewFilterState {
  readonly outcome?: FlightReviewOutcome;
  readonly since?: string;
  readonly until?: string;
  readonly tag?: string;
}

export interface FlightReviewManualPatchDto {
  readonly outcome?: Exclude<FlightReviewOutcome, 'unknown'>;
  readonly tags?: readonly string[];
  readonly notes?: string;
  /** Rationale Audit（S4）。サーバー側で outcome 系と分離適用され outcome_source を変えない。 */
  readonly rationaleAuditStatus?: RationaleAuditStatusDto;
}

export interface FlightReviewSaveResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface FlightReviewViewState {
  readonly loading: boolean;
  /** 直近の一覧取得が失敗したか。0 件（空データ）と混同しない。 */
  readonly loadFailed: boolean;
  readonly reviews: readonly FlightReviewDto[];
  readonly filter: FlightReviewFilterState;
  readonly selectedSessionId: string | null;
  /** 選択セッションの user_feedback_entries（S2 データ。未取得・0 件は空配列）。 */
  readonly selectedFeedback: readonly UserFeedbackDto[];
  /** 選択セッションのコミットに紐付く Rationale ノード（S4。未取得・0 件は空配列）。 */
  readonly selectedRationale: readonly RationaleNodeDto[];
  readonly saving: boolean;
  /** 訂正フォーム編集中（ポーリング反映を保留する）。 */
  readonly editing: boolean;
}

export interface FlightReviewStoreOptions {
  /** ポーリングを行うか。既定 false（web-app 埋め込みで存在しない API を叩かない）。 */
  readonly enabled?: boolean;
  /** ポーリング間隔（ms）。既定 30 秒。 */
  readonly pollIntervalMs?: number;
}

export interface FlightReviewStore {
  getState(): FlightReviewViewState;
  subscribe(listener: () => void): () => void;
  /** 即時に一覧を取り直す（フィルタ変更・保存直後の反映用）。 */
  refresh(): Promise<void>;
  setFilter(filter: FlightReviewFilterState): void;
  /** 行選択。選択時に当該セッションの user feedback も取得する。null で解除。 */
  select(sessionId: string | null): Promise<void>;
  setEditing(editing: boolean): void;
  saveManual(sessionId: string, patch: FlightReviewManualPatchDto): Promise<FlightReviewSaveResult>;
  dispose(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const LIST_LIMIT = 200;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createFlightReviewStore(
  serverUrl: string,
  options?: FlightReviewStoreOptions,
): FlightReviewStore {
  const enabled = options?.enabled ?? false;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let disposed = false;
  let warnedOnce = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let state: FlightReviewViewState = {
    loading: false,
    loadFailed: false,
    reviews: [],
    filter: {},
    selectedSessionId: null,
    selectedFeedback: [],
    selectedRationale: [],
    saving: false,
    editing: false,
  };

  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();

  function notify(): void {
    for (const l of listeners) l();
  }

  function setState(patch: Partial<FlightReviewViewState>): void {
    if (disposed) return;
    state = { ...state, ...patch };
    notify();
  }

  /** in-flight fetch を dispose で中断できるようにする。 */
  async function request(path: string, init?: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    controllers.add(ctrl);
    try {
      return await fetch(`${serverUrl}${path}`, { ...init, signal: ctrl.signal });
    } finally {
      controllers.delete(ctrl);
    }
  }

  function buildListQuery(): string {
    const params = new URLSearchParams();
    const { outcome, since, until, tag } = state.filter;
    if (outcome !== undefined) params.set('outcome', outcome);
    if (since !== undefined && since !== '') params.set('since', since);
    if (until !== undefined && until !== '') params.set('until', until);
    if (tag !== undefined && tag !== '') params.set('tag', tag);
    params.set('limit', String(LIST_LIMIT));
    return `?${params.toString()}`;
  }

  async function refresh(): Promise<void> {
    // 編集中は取得自体を保留する（訂正フォームの状態を静かに保つ）
    if (disposed || state.editing) return;
    setState({ loading: true });
    try {
      const res = await request(`/api/trail/flight-reviews${buildListQuery()}`);
      if (disposed) return;
      if (!res.ok) {
        setState({ loading: false, loadFailed: true });
        return;
      }
      const json = (await res.json()) as { flightReviews?: FlightReviewDto[] };
      if (disposed || state.editing) return;
      setState({ loading: false, loadFailed: false, reviews: json.flightReviews ?? [] });
    } catch (err) {
      if (disposed) return;
      // サーバー停止は運用上ありふれる。毎ポーリングで警告を積まない（silent にはしない）
      if (!warnedOnce) {
        warnedOnce = true;
        console.warn(`[flightReview] failed to list flight reviews: ${errorMessage(err)}`);
      }
      setState({ loading: false, loadFailed: true });
    }
  }

  async function fetchFeedback(sessionId: string): Promise<readonly UserFeedbackDto[]> {
    try {
      const res = await request(`/api/trail/user-feedback?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return [];
      const json = (await res.json()) as { userFeedback?: UserFeedbackDto[] };
      return json.userFeedback ?? [];
    } catch (err) {
      console.warn(`[flightReview] failed to list user feedback for ${sessionId}: ${errorMessage(err)}`);
      return [];
    }
  }

  async function fetchRationale(sessionId: string): Promise<readonly RationaleNodeDto[]> {
    try {
      const res = await request(`/api/memory/rationale?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return [];
      const json = (await res.json()) as { rationale?: RationaleNodeDto[] };
      return json.rationale ?? [];
    } catch (err) {
      // memory.db 不在環境（web-app 埋め込み等）では日常的に失敗し得る。rationale のみ縮退
      console.warn(`[flightReview] failed to list rationale for ${sessionId}: ${errorMessage(err)}`);
      return [];
    }
  }

  if (enabled) {
    void refresh();
    pollTimer = setInterval(() => void refresh(), pollIntervalMs);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    setFilter(filter) {
      setState({ filter });
      void refresh();
    },
    async select(sessionId) {
      if (sessionId === null) {
        setState({ selectedSessionId: null, selectedFeedback: [], selectedRationale: [], editing: false });
        return;
      }
      // 行切替は編集の離脱（editing ラッチを解消しポーリングを再開する）
      setState({ selectedSessionId: sessionId, selectedFeedback: [], selectedRationale: [], editing: false });
      const [feedback, rationale] = await Promise.all([fetchFeedback(sessionId), fetchRationale(sessionId)]);
      if (disposed || state.selectedSessionId !== sessionId) return;
      setState({ selectedFeedback: feedback, selectedRationale: rationale });
    },
    setEditing(editing) {
      setState({ editing });
      if (!editing) void refresh();
    },
    async saveManual(sessionId, patch) {
      setState({ saving: true });
      try {
        const res = await request(`/api/trail/flight-reviews/${encodeURIComponent(sessionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          // サーバーの理由をそのまま UI へ返す（「失敗しました」だけにしない）
          setState({ saving: false });
          return { ok: false, error: json.error ?? `HTTP ${res.status}` };
        }
        setState({ saving: false, editing: false });
        await refresh();
        return { ok: true };
      } catch (err) {
        setState({ saving: false });
        return { ok: false, error: errorMessage(err) };
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pollTimer !== null) clearInterval(pollTimer);
      pollTimer = null;
      for (const c of controllers) c.abort();
      controllers.clear();
      listeners.clear();
    },
  };
}
