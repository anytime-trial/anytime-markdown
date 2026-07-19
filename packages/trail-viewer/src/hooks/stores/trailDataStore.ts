/**
 * trailDataStore — framework-agnostic vanilla store that reproduces
 * `useTrailDataSource` without React.
 *
 * API surface:
 *   createTrailDataStore(serverUrl, options?) → TrailDataStore
 *   store.getState()   → TrailDataSourceResult (same shape as the hook)
 *   store.subscribe(listener) → unsubscribe fn
 *   store.dispose()    → cancel in-flight fetches, close WS
 */

import type {
  AnalyticsData,
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailFilter,
  TrailMessage,
  TrailPromptEntry,
  TrailSession,
  TrailSessionCommit,
} from '../../domain/parser/types';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';

import type { TrailDataSourceResult } from '../useTrailDataSource';
import type { TokenBudgetStatus } from '../useTokenBudgetsWs';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TrailDataStoreOptions {
  /** prompts データの取得を有効化するか。既定 true。 */
  readonly promptsEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface TrailDataStore {
  getState(): TrailDataSourceResult;
  subscribe(listener: () => void): () => void;
  /** prompts の遅延取得を有効化する（Prompts ポップアップ初回オープン時に呼ぶ）。 */
  setPromptsEnabled(enabled: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const RECONNECT_DELAY_MS = 3_000;
const MAX_RETRIES = 5;
const TOKEN_BUDGET_TTL_MS = 5 * 60 * 1000;

function buildQueryString(filter: TrailFilter): string {
  const params = new URLSearchParams();
  if (filter.gitBranch) params.set('branch', filter.gitBranch);
  if (filter.model) params.set('model', filter.model);
  if (filter.searchText) params.set('q', filter.searchText);
  if (filter.dateRange) {
    params.set('from', filter.dateRange.from);
    params.set('to', filter.dateRange.to);
  }
  if (filter.workspace) params.set('workspace', filter.workspace);
  if (filter.toolName) params.set('toolName', filter.toolName);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function isWsMessage(v: unknown): v is { type: string } {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).type === 'string';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTrailDataStore(
  serverUrl: string,
  options?: TrailDataStoreOptions,
): TrailDataStore {
  const baseUrl = serverUrl;
  let promptsEnabled = options?.promptsEnabled ?? true;

  // ----- Mutable state -----
  let disposed = false;
  let sessions: readonly TrailSession[] = [];
  let allSessions: readonly TrailSession[] = [];
  let messages: readonly TrailMessage[] = [];
  let loading = false;
  let sessionsLoading = false;
  let error: string | null = null;
  let analytics: AnalyticsData | null = null;
  let costOptimization: CostOptimizationData | null = null;
  let releases: readonly TrailRelease[] = [];
  let prompts: readonly TrailPromptEntry[] = [];
  let connected = false;
  let tokenBudgetMap = new Map<string, TokenBudgetStatus>();

  // ----- Listeners -----
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const l of listeners) l();
  }

  // ----- Abort controllers / timers -----
  const sessionsFetchController = { current: new AbortController() };
  const promptsController = { current: new AbortController() };
  let wsInstance: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  const budgetTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  async function fetchSessions(filter?: TrailFilter, isInitial = false): Promise<void> {
    if (disposed) return;
    sessionsLoading = true;
    error = null;
    notify();

    const ctrl = new AbortController();
    sessionsFetchController.current.abort();
    sessionsFetchController.current = ctrl;

    try {
      const qs = filter ? buildQueryString(filter) : '';
      const res = await fetch(`${baseUrl}/api/trail/sessions${qs}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted || disposed) return;
      if (!res.ok) {
        error = `Failed to fetch sessions: ${res.status}`;
        return;
      }
      const data: unknown = await res.json();
      if (ctrl.signal.aborted || disposed) return;
      let parsed: readonly TrailSession[];
      if (Array.isArray(data)) {
        parsed = data as readonly TrailSession[];
      } else if (data && typeof data === 'object' && 'sessions' in data) {
        parsed = (data as { sessions: readonly TrailSession[] }).sessions;
      } else {
        parsed = [];
      }
      sessions = parsed;
      if (isInitial) allSessions = parsed;
    } catch (err) {
      if (disposed) return;
      const e = err as { name?: string };
      if (e.name === 'AbortError') return;
      error = err instanceof Error ? err.message : 'Failed to fetch sessions';
    } finally {
      if (!disposed) {
        sessionsLoading = false;
        notify();
      }
    }
  }

  function loadSession(id: string): void {
    if (disposed) return;
    loading = true;
    error = null;
    notify();

    fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (disposed) return;
        if (!res.ok) {
          error = `Failed to load session: ${res.status}`;
          return;
        }
        const data: unknown = await res.json();
        if (disposed) return;
        if (data && typeof data === 'object' && 'messages' in data) {
          messages = (data as { messages: readonly TrailMessage[] }).messages;
        } else if (Array.isArray(data)) {
          messages = data as readonly TrailMessage[];
        }
      })
      .catch((err: unknown) => {
        if (disposed) return;
        error = err instanceof Error ? err.message : 'Failed to load session';
      })
      .finally(() => {
        if (!disposed) {
          loading = false;
          notify();
        }
      });
  }

  async function fetchSessionMessages(id: string): Promise<readonly TrailMessage[]> {
    const res = await fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'messages' in data) {
      return (data as { messages: readonly TrailMessage[] }).messages;
    }
    if (Array.isArray(data)) return data as readonly TrailMessage[];
    return [];
  }

  async function fetchSessionCommits(id: string): Promise<readonly TrailSessionCommit[]> {
    try {
      const res = await fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}/commits`);
      if (!res.ok) return [];
      const data = (await res.json()) as { commits: readonly TrailSessionCommit[] };
      return data.commits ?? [];
    } catch {
      return [];
    }
  }

  function searchSessions(filter: TrailFilter): void {
    void fetchSessions(filter);
  }

  async function refetchAll(): Promise<void> {
    await fetchSessions(undefined, true);
  }

  // ------------------------------------------------------------------
  // Analytics
  // ------------------------------------------------------------------

  async function fetchSessionToolMetrics(id: string): Promise<ToolMetrics | null> {
    try {
      const res = await fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}/tool-metrics`);
      if (!res.ok) return null;
      return (await res.json()) as ToolMetrics;
    } catch {
      return null;
    }
  }

  async function fetchDayToolMetrics(date: string): Promise<ToolMetrics | null> {
    try {
      const res = await fetch(`${baseUrl}/api/trail/days/${encodeURIComponent(date)}/tool-metrics`);
      if (!res.ok) return null;
      return (await res.json()) as ToolMetrics;
    } catch {
      return null;
    }
  }

  async function fetchCostOptimization(): Promise<CostOptimizationData | null> {
    try {
      const res = await fetch(`${baseUrl}/api/trail/cost-optimization`);
      if (!res.ok) return null;
      return (await res.json()) as CostOptimizationData;
    } catch {
      return null;
    }
  }

  async function fetchCombinedData(
    period: CombinedPeriodMode,
    rangeDays: CombinedRangeDays,
    workspace?: string,
  ): Promise<CombinedData> {
    const empty: CombinedData = {
      toolCounts: [],
      errorRate: [],
      skillStats: [],
      modelStats: [],
      agentStats: [],
      commitPrefixStats: [],
      aiFirstTryRate: [],
      qualityRates: [],
      workspaces: [],
    };
    try {
      const workspaceParam = workspace ? `&workspace=${encodeURIComponent(workspace)}` : '';
      const res = await fetch(
        `${baseUrl}/api/trail/combined?period=${period}&rangeDays=${rangeDays}${workspaceParam}`,
      );
      if (!res.ok) return empty;
      return (await res.json()) as CombinedData;
    } catch {
      return empty;
    }
  }

  async function refreshAnalytics(): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}/api/trail/analytics`);
      if (res.ok) {
        const data: unknown = await res.json();
        if (!disposed && data && typeof data === 'object' && 'totals' in data) {
          analytics = data as AnalyticsData;
          notify();
        }
      }
    } catch {
      // analytics endpoint may not exist
    }
    try {
      const data = await fetchCostOptimization();
      if (!disposed && data) {
        costOptimization = data;
        notify();
      }
    } catch {
      // cost-optimization endpoint may not exist
    }
  }

  // ------------------------------------------------------------------
  // Releases
  // ------------------------------------------------------------------

  async function fetchReleases(): Promise<readonly TrailRelease[]> {
    try {
      const res = await fetch(`${baseUrl}/api/trail/releases`);
      if (!res.ok) return [];
      const data = (await res.json()) as readonly TrailRelease[];
      if (!disposed) {
        releases = data;
        notify();
      }
      return data;
    } catch {
      return [];
    }
  }

  async function fetchQualityMetrics(range: DateRange): Promise<QualityMetrics | null> {
    const url = `${baseUrl}/api/trail/quality-metrics?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[trailDataStore][fetchQualityMetrics] HTTP ${res.status}: ${body}`);
        return null;
      }
      return (await res.json()) as QualityMetrics;
    } catch (err) {
      console.error('[trailDataStore][fetchQualityMetrics] request failed', err);
      return null;
    }
  }

  async function fetchDeploymentFrequency(
    range: DateRange,
    bucket: 'day' | 'week',
  ): Promise<ReadonlyArray<{ bucketStart: string; value: number }>> {
    const url = `${baseUrl}/api/trail/deployment-frequency?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[trailDataStore][fetchDeploymentFrequency] HTTP ${res.status}: ${body}`);
        return [];
      }
      return (await res.json()) as ReadonlyArray<{ bucketStart: string; value: number }>;
    } catch (err) {
      console.error('[trailDataStore][fetchDeploymentFrequency] request failed', err);
      return [];
    }
  }

  async function fetchReleaseQuality(
    range: DateRange,
    bucket: 'day' | 'week',
  ): Promise<ReadonlyArray<ReleaseQualityBucket>> {
    const url = `${baseUrl}/api/trail/deployment-frequency-quality?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[trailDataStore][fetchReleaseQuality] HTTP ${res.status}: ${body}`);
        return [];
      }
      return (await res.json()) as ReadonlyArray<ReleaseQualityBucket>;
    } catch (err) {
      console.error('[trailDataStore][fetchReleaseQuality] request failed', err);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // Prompts
  // ------------------------------------------------------------------

  function fetchPrompts(): void {
    if (!promptsEnabled || disposed) return;

    const ctrl = new AbortController();
    promptsController.current.abort();
    promptsController.current = ctrl;

    void (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/prompts`, { signal: ctrl.signal });
        if (res.ok) {
          const data: unknown = await res.json();
          if (ctrl.signal.aborted || disposed) return;
          if (data && typeof data === 'object' && 'prompts' in data) {
            prompts = (data as { prompts: readonly TrailPromptEntry[] }).prompts;
            notify();
          }
        }
      } catch {
        // prompts endpoint may not exist / aborted
      }
    })();
  }

  // ------------------------------------------------------------------
  // WebSocket (token budgets + sessions-updated cross-trigger)
  // ------------------------------------------------------------------

  function connectWs(): void {
    if (!serverUrl || disposed) return;
    let host: string;
    try {
      host = new URL(serverUrl).host;
    } catch {
      return;
    }
    const ws = new WebSocket(`ws://${host}/ws`);
    wsInstance = ws;

    ws.addEventListener('open', () => {
      if (disposed) { ws.close(); return; }
      connected = true;
      retryCount = 0;
      notify();
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      if (disposed) return;
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (isWsMessage(parsed) && parsed.type === 'sessions-updated') {
          void refetchAll();
          void refreshAnalytics();
        }
        if (isWsMessage(parsed) && parsed.type === 'token-budget-updated') {
          const status = parsed as unknown as TokenBudgetStatus;
          tokenBudgetMap = new Map(tokenBudgetMap);
          tokenBudgetMap.set(status.sessionId, status);

          const existing = budgetTimers.get(status.sessionId);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            if (disposed) return;
            if (tokenBudgetMap.has(status.sessionId)) {
              tokenBudgetMap = new Map(tokenBudgetMap);
              tokenBudgetMap.delete(status.sessionId);
              budgetTimers.delete(status.sessionId);
              notify();
            }
          }, TOKEN_BUDGET_TTL_MS);
          budgetTimers.set(status.sessionId, timer);
          notify();
        }
      } catch {
        // Malformed message — ignore
      }
    });

    ws.addEventListener('close', () => {
      if (disposed) return;
      connected = false;
      notify();
      scheduleWsReconnect();
    });

    ws.addEventListener('error', () => {
      if (disposed) return;
      connected = false;
      notify();
      ws.close();
    });
  }

  function scheduleWsReconnect(): void {
    if (disposed || retryCount >= MAX_RETRIES) return;
    retryCount += 1;
    retryTimer = setTimeout(connectWs, RECONNECT_DELAY_MS);
  }

  // ------------------------------------------------------------------
  // Initial data load
  // ------------------------------------------------------------------

  void fetchSessions(undefined, true);
  void refreshAnalytics();
  void fetchReleases();
  fetchPrompts();
  connectWs();

  // ------------------------------------------------------------------
  // Store API
  // ------------------------------------------------------------------

  function getState(): TrailDataSourceResult {
    return {
      sessions,
      allSessions,
      messages,
      loading,
      sessionsLoading,
      error,
      loadSession,
      searchSessions,
      fetchSessionMessages,
      fetchSessionCommits,
      analytics,
      costOptimization,
      fetchCombinedData,
      fetchSessionToolMetrics,
      fetchDayToolMetrics,
      fetchCostOptimization,
      releases,
      fetchReleases,
      fetchQualityMetrics,
      fetchDeploymentFrequency,
      fetchReleaseQuality,
      prompts,
      connected,
      tokenBudgets: Array.from(tokenBudgetMap.values()),
    };
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * prompts の遅延取得を有効化する。store は promptsEnabled=false で生成され得る
   * （Prompts 未オープン）。false→true で fetchPrompts を起動する（これが無いと
   * Prompts ポップアップが永久に空になる）。
   */
  function setPromptsEnabled(next: boolean): void {
    if (next === promptsEnabled || disposed) return;
    promptsEnabled = next;
    if (next) fetchPrompts();
  }

  function dispose(): void {
    disposed = true;

    sessionsFetchController.current.abort();
    promptsController.current.abort();

    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (wsInstance) {
      wsInstance.close();
      wsInstance = null;
    }
    for (const t of budgetTimers.values()) clearTimeout(t);
    budgetTimers.clear();
    listeners.clear();
  }

  return { getState, subscribe, setPromptsEnabled, dispose };
}
