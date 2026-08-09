/**
 * flightFindingStore — Flight Record（指示単位）へ畳んだレビュー指摘の状態管理。
 *
 * API surface:
 *   createFlightFindingStore(serverUrl, options?) → FlightFindingStore
 *   store.getState()   → FlightFindingViewState
 *   store.subscribe(listener) → unsubscribe fn
 *   store.refresh()    → 件数と一覧を取り直す
 *   store.dispose()    → in-flight fetch の中断
 *
 * 設計の要点:
 *   - サーバー不達（loadFailed）と 0 件（空配列）を区別する（flightReviewStore と同原則）。
 *     指摘が「無い」のか「引けなかった」のかを一覧の件数列で取り違えると、レビュー漏れを
 *     「指摘なし」と読んでしまう。
 *   - 件数は SQL 集計の専用ルートから取る。一覧（limit 付き）を数えると打ち切りで過少になる。
 *   - 一覧は全指示ぶんを 1 回で取る。Review タブが全指示横断の表であり、詳細ペインは
 *     同じ配列を instructionId で絞るだけなので、選択のたびに引き直さない。
 */

import type {
  CaravanFlightReviewFindingCountRow,
  CaravanFlightReviewFindingRow,
} from './types';

export interface FlightFindingViewState {
  readonly loading: boolean;
  /** サーバー不達・取得失敗。0 件（空配列）と区別する。 */
  readonly loadFailed: boolean;
  readonly counts: readonly CaravanFlightReviewFindingCountRow[];
  readonly findings: readonly CaravanFlightReviewFindingRow[];
}

export interface FlightFindingStore {
  getState(): FlightFindingViewState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  /**
   * ワークスペース絞り込みを差し替えて取り直す。空文字は絞り込み無し。
   * クライアント側で `findings` を filter しないのは、一覧の limit が絞り込み前に効くため
   * （選んだワークスペースの指摘が窓から溢れて「0 件」に見える）。
   */
  setWorkspace(workspace: string): Promise<void>;
  /** 指定した指示の指摘だけを返す（取得済み配列の絞り込み。追加取得はしない）。 */
  findingsFor(instructionId: string): readonly CaravanFlightReviewFindingRow[];
  /** 指定した指示の件数。未取得・0 件はいずれも null ではなく 0 件行を返さないため呼び出し側が区別する。 */
  countsFor(instructionId: string): CaravanFlightReviewFindingCountRow | null;
  dispose(): void;
}

export interface FlightFindingStoreOptions {
  /** 一覧の上限。既定 500。Review タブは全指示横断なので既定を大きめに取る。 */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 500;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createFlightFindingStore(
  serverUrl: string,
  options?: FlightFindingStoreOptions,
): FlightFindingStore {
  const limit = options?.limit ?? DEFAULT_LIMIT;

  let disposed = false;
  let warnedOnce = false;
  let workspaceFilter = '';
  /**
   * 取得の世代。ワークスペースを A→B と続けて切り替えると 2 本走り、A の応答が遅れて
   * 着弾すると B の結果として表示される（ドロップダウンは B のまま）。
   */
  let refreshSeq = 0;
  let state: FlightFindingViewState = {
    loading: false,
    loadFailed: false,
    counts: [],
    findings: [],
  };

  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();

  function setState(patch: Partial<FlightFindingViewState>): void {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const l of listeners) l();
  }

  async function request(path: string): Promise<Response> {
    const ctrl = new AbortController();
    controllers.add(ctrl);
    try {
      return await fetch(`${serverUrl}${path}`, { signal: ctrl.signal });
    } finally {
      controllers.delete(ctrl);
    }
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    const seq = ++refreshSeq;
    const isStale = (): boolean => disposed || seq !== refreshSeq;
    setState({ loading: true });
    try {
      const workspaceQuery = workspaceFilter === ''
        ? ''
        : `&workspace=${encodeURIComponent(workspaceFilter)}`;
      const [countsRes, findingsRes] = await Promise.all([
        // 件数は指示 ID で突き合わせるため絞り込まない（一覧側が既にワークスペースで
        // 絞られており、余分な行は突合で落ちる）。
        request('/api/caravan/reviews/flight-counts'),
        request(`/api/caravan/reviews/flight-findings?limit=${limit}${workspaceQuery}`),
      ]);
      if (isStale()) return;
      if (!countsRes.ok || !findingsRes.ok) {
        setState({ loading: false, loadFailed: true });
        return;
      }
      const counts = (await countsRes.json()) as unknown;
      const findings = (await findingsRes.json()) as unknown;
      if (isStale()) return;
      // 形が違う応答（旧サーバー・プロキシのエラーページ）を空配列へ丸めない。
      // 丸めると「指摘なし」と区別が付かなくなる。
      if (!Array.isArray(counts) || !Array.isArray(findings)) {
        console.warn('[flightFinding] unexpected response shape from /api/caravan/reviews/*');
        setState({ loading: false, loadFailed: true });
        return;
      }
      setState({
        loading: false,
        loadFailed: false,
        counts: counts as CaravanFlightReviewFindingCountRow[],
        findings: findings as CaravanFlightReviewFindingRow[],
      });
    } catch (err) {
      if (isStale()) return;
      // サーバー停止は運用上ありふれる。毎回警告を積まない（silent にはしない）
      if (!warnedOnce) {
        warnedOnce = true;
        console.warn(`[flightFinding] failed to load review findings: ${errorMessage(err)}`);
      }
      setState({ loading: false, loadFailed: true });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    async setWorkspace(workspace) {
      if (workspace === workspaceFilter) return;
      workspaceFilter = workspace;
      await refresh();
    },
    findingsFor(instructionId) {
      return state.findings.filter((f) => f.instructionId === instructionId);
    },
    countsFor(instructionId) {
      return state.counts.find((c) => c.instructionId === instructionId) ?? null;
    },
    dispose() {
      disposed = true;
      for (const c of controllers) c.abort();
      controllers.clear();
      listeners.clear();
    },
  };
}
