/**
 * workspaceStore — Flight Record のワークスペース選択肢。
 *
 * API surface:
 *   createWorkspaceStore(serverUrl) → WorkspaceStore
 *   store.getState()   → WorkspaceViewState
 *   store.subscribe(listener) → unsubscribe fn
 *   store.refresh()    → 選択肢を取り直す
 *   store.dispose()    → in-flight fetch の中断
 *
 * 設計の要点:
 *   - 選択肢は専用ルート（`/api/trail/workspaces`）から取る。一覧（limit + 絞り込み付き）
 *     から作ると、表示窓に出ていないワークスペースが選択肢から消え、「そのワークスペースの
 *     記録が無い」と読めてしまう。
 *   - サーバー不達（loadFailed）と 0 件を区別する。0 件へ丸めるとドロップダウンが
 *     「すべて」だけになり、絞り込めない理由が画面から消える。
 *   - `partial` はサーバー側で片方の DB（trail.db / memory-core）が読めなかったことを示す。
 *     選択肢は返るが揃っていない、という状態を潰さずに持つ。
 */

export interface WorkspaceViewState {
  readonly loading: boolean;
  /** 取得失敗。0 件（空配列）と区別する。 */
  readonly loadFailed: boolean;
  /** 選択肢（名前）。サーバー側で名前順に整列済み。 */
  readonly workspaces: readonly string[];
  /** サーバー側でどちらかの DB が読めず、選択肢が欠けている可能性がある。 */
  readonly partial: boolean;
}

export interface WorkspaceStore {
  getState(): WorkspaceViewState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  dispose(): void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createWorkspaceStore(serverUrl: string): WorkspaceStore {
  let disposed = false;
  let warnedOnce = false;
  let state: WorkspaceViewState = {
    loading: false,
    loadFailed: false,
    workspaces: [],
    partial: false,
  };

  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();

  function setState(patch: Partial<WorkspaceViewState>): void {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const l of listeners) l();
  }

  async function refresh(): Promise<void> {
    if (disposed || serverUrl === '') return;
    setState({ loading: true });
    const ctrl = new AbortController();
    controllers.add(ctrl);
    try {
      const res = await fetch(`${serverUrl}/api/trail/workspaces`, { signal: ctrl.signal });
      if (disposed) return;
      if (!res.ok) {
        setState({ loading: false, loadFailed: true });
        return;
      }
      const json = (await res.json()) as { workspaces?: unknown; partial?: unknown };
      if (disposed) return;
      // 形が違う応答（旧サーバー・プロキシのエラーページ）を空配列へ丸めない。
      if (!Array.isArray(json.workspaces)) {
        console.warn('[workspace] unexpected response shape from /api/trail/workspaces');
        setState({ loading: false, loadFailed: true });
        return;
      }
      setState({
        loading: false,
        loadFailed: false,
        workspaces: json.workspaces.filter((w): w is string => typeof w === 'string' && w !== ''),
        partial: json.partial === true,
      });
    } catch (err) {
      if (disposed) return;
      // サーバー停止は運用上ありふれる。毎回警告を積まない（silent にはしない）
      if (!warnedOnce) {
        warnedOnce = true;
        console.warn(`[workspace] failed to load workspaces: ${errorMessage(err)}`);
      }
      setState({ loading: false, loadFailed: true });
    } finally {
      controllers.delete(ctrl);
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    dispose() {
      disposed = true;
      for (const c of controllers) c.abort();
      controllers.clear();
      listeners.clear();
    },
  };
}
