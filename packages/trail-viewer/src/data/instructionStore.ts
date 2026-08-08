/**
 * instructionStore — Flight Record（指示単位の運航記録）の一覧・詳細の状態管理。
 *
 * API surface:
 *   createInstructionStore(serverUrl, options?) → InstructionStore
 *   store.getState()   → InstructionViewState
 *   store.subscribe(listener) → unsubscribe fn
 *   store.dispose()    → ポーリング停止・in-flight fetch の中断
 *
 * 設計の要点:
 *   - サーバー不達（loadFailed）と 0 件（空配列）を区別する（flightReviewStore と同原則）。
 *   - 行の単位はセッションではなく指示。1 指示に複数セッションが属す。
 *   - 所属セッションは行を選んでから取りに行く（一覧のたびに N+1 で引かない）。
 */

import type { FlightReviewOutcome } from './flightReviewStore';

/** 成果物の種別。ドキュメントは未コミットを含み、コードはコミット済みのみ。 */
export type DeliverableKind = 'doc' | 'code';

export interface InstructionDeliverableDto {
  readonly kind: DeliverableKind;
  readonly filePath: string;
  readonly committed: boolean;
  readonly commitHash: string;
}

export type VerificationKindDto = 'unit' | 'build' | 'next-build' | 'typecheck' | 'lint' | 'e2e' | 'manual';

/** trail-activity の InstructionVerificationRun の DTO（kind ごとに最新 1 件）。 */
export interface InstructionVerificationRunDto {
  readonly kind: VerificationKindDto;
  readonly package: string;
  readonly command: string;
  readonly status: 'pass' | 'fail' | 'error';
  readonly durationMs: number;
  readonly commitHash: string;
  readonly treeState: 'clean' | 'dirty';
  /** null は dirty なツリーでの実行。「このコミットで検証済み」の根拠にはならない。 */
  readonly codeStateHash: string | null;
  readonly startedAt: string;
}

export interface InstructionTokenUsageByModelDto {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly estimatedCostUsd: number;
}

/** `imported=false` は session_costs 未取込。0 件と区別する。 */
export interface InstructionTokenUsageDto {
  readonly imported: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly estimatedCostUsd: number;
  readonly byModel: readonly InstructionTokenUsageByModelDto[];
}

/** GET /api/trail/instructions の 1 行。 */
export interface InstructionRecordDto {
  readonly instructionId: string;
  readonly workspacePath: string;
  readonly workspaceName: string;
  readonly summary: string;
  readonly originPrompt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
  readonly outcome: FlightReviewOutcome;
  readonly outcomeSource: 'machine' | 'self' | 'manual';
  readonly sessionCount: number;
  readonly toolCallCount: number;
  readonly toolFailureCount: number;
  readonly reworkCount: number;
  readonly tags: readonly string[];
  readonly closedAt: string | null;
  readonly tokenUsage: InstructionTokenUsageDto;
  readonly deliverables: readonly InstructionDeliverableDto[];
  readonly verifications: readonly InstructionVerificationRunDto[];
}

export interface InstructionSessionDto {
  readonly instructionId: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly declaredAt: string;
}

export interface InstructionFilterState {
  readonly outcome?: FlightReviewOutcome;
  readonly since?: string;
  readonly until?: string;
  readonly tag?: string;
  /**
   * 一覧の「ワークスペース」列に出ている解決済みの名前で絞る。
   * 記録された workspace_path（cwd 由来で `.worktrees/<name>` 等に散る）ではないことに注意。
   */
  readonly workspace?: string;
}

export interface InstructionViewState {
  readonly loading: boolean;
  /** 直近の一覧取得が失敗したか。0 件（空データ）と混同しない。 */
  readonly loadFailed: boolean;
  readonly instructions: readonly InstructionRecordDto[];
  readonly filter: InstructionFilterState;
  readonly selectedInstructionId: string | null;
  /** 選択中の指示に属するセッション（sequence 昇順。未取得・0 件は空配列）。 */
  readonly selectedSessions: readonly InstructionSessionDto[];
  /** 詳細ペインで開いているセッション（セッション単位の振り返り・訂正の対象）。 */
  readonly selectedSessionId: string | null;
}

export interface InstructionStoreOptions {
  /** ポーリングを行うか。既定 false（web-app 埋め込みで存在しない API を叩かない）。 */
  readonly enabled?: boolean;
  /** ポーリング間隔（ms）。既定 30 秒。 */
  readonly pollIntervalMs?: number;
}

export interface InstructionStore {
  getState(): InstructionViewState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  setFilter(filter: InstructionFilterState): void;
  /** 指示の選択。所属セッションを取得し、先頭セッションを詳細に開く。null で解除。 */
  select(instructionId: string | null): Promise<void>;
  /** 詳細ペインで開くセッションの切替（所属セッション内）。 */
  selectSession(sessionId: string | null): void;
  dispose(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const LIST_LIMIT = 200;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createInstructionStore(
  serverUrl: string,
  options?: InstructionStoreOptions,
): InstructionStore {
  const enabled = options?.enabled ?? false;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let disposed = false;
  let warnedOnce = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let state: InstructionViewState = {
    loading: false,
    loadFailed: false,
    instructions: [],
    filter: {},
    selectedInstructionId: null,
    selectedSessions: [],
    selectedSessionId: null,
  };

  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();

  function notify(): void {
    for (const l of listeners) l();
  }

  function setState(patch: Partial<InstructionViewState>): void {
    if (disposed) return;
    state = { ...state, ...patch };
    notify();
  }

  /** in-flight fetch を dispose で中断できるようにする。 */
  async function request(path: string): Promise<Response> {
    const ctrl = new AbortController();
    controllers.add(ctrl);
    try {
      return await fetch(`${serverUrl}${path}`, { signal: ctrl.signal });
    } finally {
      controllers.delete(ctrl);
    }
  }

  function buildListQuery(): string {
    const params = new URLSearchParams();
    const { outcome, since, until, tag, workspace } = state.filter;
    if (outcome !== undefined) params.set('outcome', outcome);
    if (since !== undefined && since !== '') params.set('since', since);
    if (until !== undefined && until !== '') params.set('until', until);
    if (tag !== undefined && tag !== '') params.set('tag', tag);
    if (workspace !== undefined && workspace !== '') params.set('workspace', workspace);
    params.set('limit', String(LIST_LIMIT));
    return `?${params.toString()}`;
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    setState({ loading: true });
    try {
      const res = await request(`/api/trail/instructions${buildListQuery()}`);
      if (disposed) return;
      if (!res.ok) {
        setState({ loading: false, loadFailed: true });
        return;
      }
      const json = (await res.json()) as { instructions?: InstructionRecordDto[] };
      if (disposed) return;
      setState({ loading: false, loadFailed: false, instructions: json.instructions ?? [] });
    } catch (err) {
      if (disposed) return;
      // サーバー停止は運用上ありふれる。毎ポーリングで警告を積まない（silent にはしない）
      if (!warnedOnce) {
        warnedOnce = true;
        console.warn(`[instruction] failed to list instructions: ${errorMessage(err)}`);
      }
      setState({ loading: false, loadFailed: true });
    }
  }

  async function fetchSessions(instructionId: string): Promise<readonly InstructionSessionDto[]> {
    try {
      const res = await request(`/api/trail/instructions/${encodeURIComponent(instructionId)}/sessions`);
      if (!res.ok) return [];
      const json = (await res.json()) as { sessions?: InstructionSessionDto[] };
      return json.sessions ?? [];
    } catch (err) {
      console.warn(`[instruction] failed to list sessions for ${instructionId}: ${errorMessage(err)}`);
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
    async select(instructionId) {
      if (instructionId === null) {
        setState({ selectedInstructionId: null, selectedSessions: [], selectedSessionId: null });
        return;
      }
      setState({ selectedInstructionId: instructionId, selectedSessions: [], selectedSessionId: null });
      const sessions = await fetchSessions(instructionId);
      if (disposed || state.selectedInstructionId !== instructionId) return;
      // 宣言の無いセッションは暗黙グループで、指示 ID がセッション ID 自身になる。
      // その場合 /sessions は空を返すため、指示 ID をそのままセッションとして開く。
      const firstSessionId = sessions[0]?.sessionId ?? instructionId;
      setState({ selectedSessions: sessions, selectedSessionId: firstSessionId });
    },
    selectSession(sessionId) {
      setState({ selectedSessionId: sessionId });
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
