/**
 * emergencyStore — Phase 5 S5。Kill Switch の状態購読と操作 API（vanilla store）。
 *
 * API surface:
 *   createEmergencyStore(serverUrl, options?) → EmergencyStore
 *   store.getState()   → EmergencyViewState
 *   store.subscribe(listener) → unsubscribe fn
 *   store.dispose()    → ポーリング停止・in-flight fetch の中断
 *
 * 状態は 3 値（active / inactive / unknown）。**サーバーへ到達できない場合は unknown** とし、
 * 「台帳が無い = inactive（通常運転）」と決して混同しない。障害と空データを同じ顔にすると、
 * 緊急停止中なのに平常に見える／その逆が起きる（AgentStatusClient で踏んだ既知の失敗）。
 */

export type EmergencyStatus = 'active' | 'inactive' | 'unknown';

export interface EmergencyViewState {
  readonly status: EmergencyStatus;
  readonly reason?: string;
  readonly triggeredBy?: string;
  /** UTC ISO 8601 */
  readonly triggeredAt?: string;
}

export interface SafePointDto {
  readonly id: number;
  readonly createdAt: string;
  readonly commitHash: string;
  readonly branch: string;
  readonly worktree: string;
  readonly label: string;
  readonly source: string;
  readonly sessionId: string | null;
}

export interface EmergencyActionResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly recoverBranch?: string;
}

export interface EmergencyStoreOptions {
  /**
   * 状態ポーリングを行うか。既定 false。
   * web-app（公開デプロイ）へ埋め込まれた viewer が、存在しないローカル API を叩き続けないよう
   * **明示 opt-in** にする（standalone のみ true）。
   */
  readonly enabled?: boolean;
  /** ポーリング間隔（ms）。既定 10 秒。 */
  readonly pollIntervalMs?: number;
}

export interface EmergencyStore {
  getState(): EmergencyViewState;
  subscribe(listener: () => void): () => void;
  /** 即時に状態を取り直す（操作直後の反映用）。 */
  refresh(): Promise<void>;
  activate(reason: string): Promise<EmergencyActionResult>;
  release(reason: string): Promise<EmergencyActionResult>;
  rollback(commitHash: string): Promise<EmergencyActionResult>;
  fetchSafePoints(): Promise<readonly SafePointDto[]>;
  dispose(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** 変更系 POST に必須。単純リクエストでは付けられないため CSRF 型送信を弾く（サーバーと対） */
const MUTATION_HEADERS = {
  'Content-Type': 'application/json',
  'X-Anytime-Emergency': '1',
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createEmergencyStore(
  serverUrl: string,
  options?: EmergencyStoreOptions,
): EmergencyStore {
  const enabled = options?.enabled ?? false;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let disposed = false;
  let state: EmergencyViewState = { status: 'unknown' };
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let warnedOnce = false;

  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();

  function notify(): void {
    for (const l of listeners) l();
  }

  function setState(next: EmergencyViewState): void {
    if (disposed) return;
    const changed =
      state.status !== next.status ||
      state.reason !== next.reason ||
      state.triggeredBy !== next.triggeredBy ||
      state.triggeredAt !== next.triggeredAt;
    state = next;
    if (changed) notify();
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

  async function refresh(): Promise<void> {
    if (disposed) return;
    try {
      const res = await request('/api/trail/emergency-state');
      if (disposed) return;
      if (!res.ok) {
        // 409（gitRoot 未設定）・5xx いずれも「状態が分からない」。inactive へ倒さない。
        setState({ status: 'unknown' });
        return;
      }
      const json = (await res.json()) as {
        active?: boolean;
        reason?: string;
        triggeredBy?: string;
        triggeredAt?: string;
      };
      if (disposed) return;
      if (json.active === true) {
        setState({
          status: 'active',
          reason: json.reason,
          triggeredBy: json.triggeredBy,
          triggeredAt: json.triggeredAt,
        });
        return;
      }
      if (json.active === false) {
        setState({ status: 'inactive' });
        return;
      }
      setState({ status: 'unknown' });
    } catch (err) {
      if (disposed) return;
      // サーバー停止は運用上ありふれる。毎ポーリングで警告を積まないよう初回のみ残す（silent にはしない）。
      if (!warnedOnce) {
        warnedOnce = true;
        console.warn(`[emergency] failed to read emergency state: ${errorMessage(err)}`);
      }
      setState({ status: 'unknown' });
    }
  }

  async function mutate(path: string, body: unknown): Promise<EmergencyActionResult> {
    try {
      const res = await request(path, {
        method: 'POST',
        headers: { ...MUTATION_HEADERS },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        recoverBranch?: string;
      };
      if (!res.ok) {
        // サーバーの理由をそのまま UI へ返す（「失敗しました」だけにしない）
        return { ok: false, error: json.error ?? `HTTP ${res.status}` };
      }
      return { ok: true, recoverBranch: json.recoverBranch };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
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
    activate: (reason) => mutate('/api/trail/emergency/kill-switch', { reason }),
    release: (reason) => mutate('/api/trail/emergency/release', { reason }),
    rollback: (commitHash) => mutate('/api/trail/emergency/rollback', { commitHash }),
    async fetchSafePoints() {
      try {
        const res = await request('/api/trail/safe-points?limit=50');
        if (!res.ok) return [];
        const json = (await res.json()) as { safePoints?: SafePointDto[] };
        return json.safePoints ?? [];
      } catch (err) {
        console.warn(`[emergency] failed to list safe points: ${errorMessage(err)}`);
        return [];
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
