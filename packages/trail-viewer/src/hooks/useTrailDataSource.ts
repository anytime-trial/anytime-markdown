import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AnalyticsData, CombinedData, CombinedPeriodMode, CombinedRangeDays, CostOptimizationData, ToolMetrics, TrailFilter, TrailMessage, TrailPromptEntry, TrailSession, TrailSessionCommit } from '../parser/types';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type { DateRange, QualityMetrics, ReleaseQualityBucket } from '@anytime-markdown/trail-core/domain/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenBudgetStatus {
  readonly sessionId: string;
  readonly sessionTokens: number;
  readonly dailyTokens: number;
  readonly dailyLimitTokens: number | null;
  readonly sessionLimitTokens: number | null;
  readonly alertThresholdPct: number;
  readonly turnCount: number;
  readonly messageCount: number;
}

export interface TrailDataSourceResult {
  readonly sessions: readonly TrailSession[];
  readonly allSessions: readonly TrailSession[];
  readonly messages: readonly TrailMessage[];
  readonly prompts: readonly TrailPromptEntry[];
  readonly analytics: AnalyticsData | null;
  readonly connected: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly loadSession: (id: string) => void;
  readonly searchSessions: (filter: TrailFilter) => void;
  readonly fetchSessionMessages: (id: string) => Promise<readonly TrailMessage[]>;
  readonly fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
  readonly fetchSessionToolMetrics: (id: string) => Promise<ToolMetrics | null>;
  readonly fetchDayToolMetrics: (date: string) => Promise<ToolMetrics | null>;
  readonly costOptimization: CostOptimizationData | null;
  readonly fetchCostOptimization: () => Promise<CostOptimizationData | null>;
  readonly releases: readonly TrailRelease[];
  readonly fetchReleases: () => Promise<readonly TrailRelease[]>;
  readonly fetchCombinedData: (period: CombinedPeriodMode, rangeDays: CombinedRangeDays) => Promise<CombinedData>;
  readonly fetchQualityMetrics: (range: DateRange) => Promise<QualityMetrics | null>;
  readonly fetchDeploymentFrequency: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<{ bucketStart: string; value: number }>>;
  readonly fetchReleaseQuality: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<ReleaseQualityBucket>>;
  readonly tokenBudgets: readonly TokenBudgetStatus[];
}

interface WsMessage {
  readonly type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQueryString(filter: TrailFilter): string {
  const params = new URLSearchParams();
  if (filter.gitBranch) params.set('branch', filter.gitBranch);
  if (filter.model) params.set('model', filter.model);
  if (filter.searchText) params.set('q', filter.searchText);
  if (filter.dateRange) {
    params.set('from', filter.dateRange.from);
    params.set('to', filter.dateRange.to);
  }
  if (filter.project) params.set('project', filter.project);
  if (filter.toolName) params.set('toolName', filter.toolName);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function isWsMessage(v: unknown): v is WsMessage {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).type === 'string';
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RETRIES = 5;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTrailDataSource(serverUrl: string): TrailDataSourceResult {
  // State
  const [sessions, setSessions] = useState<readonly TrailSession[]>([]);
  const [allSessions, setAllSessions] = useState<readonly TrailSession[]>([]);
  const [messages, setMessages] = useState<readonly TrailMessage[]>([]);
  const [prompts, setPrompts] = useState<readonly TrailPromptEntry[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [costOptimization, setCostOptimization] = useState<CostOptimizationData | null>(null);
  const [releases, setReleases] = useState<readonly TrailRelease[]>([]);
  const [tokenBudgetMap, setTokenBudgetMap] = useState<ReadonlyMap<string, TokenBudgetStatus>>(new Map());
  const tokenBudgetTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Base URL for API calls (serverUrl='' → same-origin relative)
  const baseUrl = serverUrl;

  // --- Fetch sessions ---

  const fetchSessions = useCallback(
    async (filter?: TrailFilter, isInitial = false): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const queryString = filter ? buildQueryString(filter) : '';
        const res = await fetch(`${baseUrl}/api/trail/sessions${queryString}`);
        if (!res.ok) {
          setError(`Failed to fetch sessions: ${res.status}`);
          return;
        }
        const data: unknown = await res.json();
        let parsed: readonly TrailSession[];
        if (Array.isArray(data)) {
          parsed = data as readonly TrailSession[];
        } else if (data && typeof data === 'object' && 'sessions' in data) {
          parsed = (data as { sessions: readonly TrailSession[] }).sessions;
        } else {
          parsed = [];
        }
        setSessions(parsed);
        if (isInitial) {
          setAllSessions(parsed);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
      } finally {
        setLoading(false);
      }
    },
    [baseUrl],
  );

  // --- Load single session messages ---

  const loadSession = useCallback(
    (id: string): void => {
      setLoading(true);
      setError(null);

      fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}`)
        .then(async (res) => {
          if (!res.ok) {
            setError(`Failed to load session: ${res.status}`);
            return;
          }
          const data: unknown = await res.json();
          if (data && typeof data === 'object' && 'messages' in data) {
            setMessages((data as { messages: readonly TrailMessage[] }).messages);
          } else if (Array.isArray(data)) {
            setMessages(data as readonly TrailMessage[]);
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [baseUrl],
  );

  // --- Fetch session messages (standalone, does not update shared state) ---

  const fetchSessionMessages = useCallback(
    async (id: string): Promise<readonly TrailMessage[]> => {
      const res = await fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}`);
      if (!res.ok) return [];
      const data: unknown = await res.json();
      if (data && typeof data === 'object' && 'messages' in data) {
        return (data as { messages: readonly TrailMessage[] }).messages;
      }
      if (Array.isArray(data)) return data as readonly TrailMessage[];
      return [];
    },
    [baseUrl],
  );

  // --- Fetch session commits (standalone, does not update shared state) ---

  const fetchSessionCommits = useCallback(
    async (id: string): Promise<readonly TrailSessionCommit[]> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}/commits`);
        if (!res.ok) return [];
        const data = (await res.json()) as { commits: readonly TrailSessionCommit[] };
        return data.commits ?? [];
      } catch {
        return [];
      }
    },
    [baseUrl],
  );

  // --- Fetch session tool metrics (standalone) ---

  const fetchSessionToolMetrics = useCallback(
    async (id: string): Promise<ToolMetrics | null> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}/tool-metrics`);
        if (!res.ok) return null;
        return (await res.json()) as ToolMetrics;
      } catch {
        return null;
      }
    },
    [baseUrl],
  );

  // --- Fetch day tool metrics ---

  const fetchDayToolMetrics = useCallback(
    async (date: string): Promise<ToolMetrics | null> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/days/${encodeURIComponent(date)}/tool-metrics`);
        if (!res.ok) return null;
        return (await res.json()) as ToolMetrics;
      } catch {
        return null;
      }
    },
    [baseUrl],
  );

  // --- Fetch cost optimization data ---

  const fetchCostOptimization = useCallback(
    async (): Promise<CostOptimizationData | null> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/cost-optimization`);
        if (!res.ok) return null;
        return (await res.json()) as CostOptimizationData;
      } catch {
        return null;
      }
    },
    [baseUrl],
  );

  // --- Fetch releases ---

  const fetchReleases = useCallback(
    async (): Promise<readonly TrailRelease[]> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/releases`);
        if (!res.ok) return [];
        const data = (await res.json()) as readonly TrailRelease[];
        setReleases(data);
        return data;
      } catch {
        return [];
      }
    },
    [baseUrl],
  );

  const fetchCombinedData = useCallback(
    async (period: CombinedPeriodMode, rangeDays: CombinedRangeDays): Promise<CombinedData> => {
      const empty: CombinedData = {
        toolCounts: [],
        errorRate: [], skillStats: [], modelStats: [], commitPrefixStats: [], aiFirstTryRate: [],
      };
      try {
        const res = await fetch(`${baseUrl}/api/trail/combined?period=${period}&rangeDays=${rangeDays}`);
        if (!res.ok) return empty;
        return (await res.json()) as CombinedData;
      } catch {
        return empty;
      }
    },
    [baseUrl],
  );

  // --- Fetch quality metrics ---

  const fetchQualityMetrics = useCallback(
    async (range: DateRange): Promise<QualityMetrics | null> => {
      const url = `${baseUrl}/api/trail/quality-metrics?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[fetchQualityMetrics] HTTP ${res.status}: ${body}`);
          return null;
        }
        return (await res.json()) as QualityMetrics;
      } catch (err) {
        console.error('[fetchQualityMetrics] request failed', err);
        return null;
      }
    },
    [baseUrl],
  );

  // --- Fetch deployment frequency (lightweight: releases only) ---

  const fetchDeploymentFrequency = useCallback(
    async (range: DateRange, bucket: 'day' | 'week'): Promise<ReadonlyArray<{ bucketStart: string; value: number }>> => {
      const url = `${baseUrl}/api/trail/deployment-frequency?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[fetchDeploymentFrequency] HTTP ${res.status}: ${body}`);
          return [];
        }
        return (await res.json()) as ReadonlyArray<{ bucketStart: string; value: number }>;
      } catch (err) {
        console.error('[fetchDeploymentFrequency] request failed', err);
        return [];
      }
    },
    [baseUrl],
  );

  // --- Fetch release quality (stacked: succeeded + failed) ---

  const fetchReleaseQuality = useCallback(
    async (range: DateRange, bucket: 'day' | 'week'): Promise<ReadonlyArray<ReleaseQualityBucket>> => {
      const url = `${baseUrl}/api/trail/deployment-frequency-quality?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[fetchReleaseQuality] HTTP ${res.status}: ${body}`);
          return [];
        }
        return (await res.json()) as ReadonlyArray<ReleaseQualityBucket>;
      } catch (err) {
        console.error('[fetchReleaseQuality] request failed', err);
        return [];
      }
    },
    [baseUrl],
  );

  // --- Search sessions ---

  const searchSessions = useCallback(
    (filter: TrailFilter): void => {
      void fetchSessions(filter);
    },
    [fetchSessions],
  );

  // --- Fetch analytics ---

  const refreshAnalytics = useCallback(
    async (): Promise<void> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/analytics`);
        if (res.ok) {
          const data: unknown = await res.json();
          if (data && typeof data === 'object' && 'totals' in data) {
            setAnalytics(data as AnalyticsData);
          }
        }
      } catch {
        // analytics endpoint may not exist
      }
      try {
        const data = await fetchCostOptimization();
        if (data) setCostOptimization(data);
      } catch {
        // cost-optimization endpoint may not exist
      }
    },
    [baseUrl, fetchCostOptimization],
  );

  // --- Initial fetch ---

  useEffect(() => {
    void fetchSessions(undefined, true);
    // Fetch prompts
    void (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/prompts`);
        if (res.ok) {
          const data: unknown = await res.json();
          if (data && typeof data === 'object' && 'prompts' in data) {
            setPrompts((data as { prompts: readonly TrailPromptEntry[] }).prompts);
          }
        }
      } catch {
        // prompts endpoint may not exist
      }
    })();
    void refreshAnalytics();
    void fetchReleases();
  }, [fetchSessions, baseUrl, refreshAnalytics, fetchReleases]);

  // --- Token budget timer cleanup on unmount ---

  useEffect(() => {
    const timers = tokenBudgetTimerRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // --- WebSocket (only when serverUrl is an absolute URL) ---

  useEffect(() => {
    if (!serverUrl) return;

    function connect(): void {
      const host = new URL(serverUrl).host;
      const ws = new WebSocket(`ws://${host}/ws`);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setConnected(true);
        retryCountRef.current = 0;
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (isWsMessage(parsed) && parsed.type === 'sessions-updated') {
            void fetchSessions(undefined, true);
            void refreshAnalytics();
          }
          if (isWsMessage(parsed) && parsed.type === 'token-budget-updated') {
            const status = parsed as unknown as TokenBudgetStatus;
            setTokenBudgetMap(prev => {
              const next = new Map(prev);
              next.set(status.sessionId, status);
              return next;
            });
            const existing = tokenBudgetTimerRef.current.get(status.sessionId);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              setTokenBudgetMap(prev => {
                if (!prev.has(status.sessionId)) return prev;
                const next = new Map(prev);
                next.delete(status.sessionId);
                return next;
              });
              tokenBudgetTimerRef.current.delete(status.sessionId);
            }, 5 * 60 * 1000);
            tokenBudgetTimerRef.current.set(status.sessionId, timer);
          }
        } catch {
          // Malformed message — ignore
        }
      });

      ws.addEventListener('close', () => {
        setConnected(false);
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        setConnected(false);
        ws.close();
      });
    }

    function scheduleReconnect(): void {
      if (retryCountRef.current >= MAX_RETRIES) return;
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  const tokenBudgets = useMemo(() => Array.from(tokenBudgetMap.values()), [tokenBudgetMap]);

  return {
    sessions,
    allSessions,
    messages,
    prompts,
    analytics,
    connected,
    loading,
    error,
    loadSession,
    searchSessions,
    fetchSessionMessages,
    fetchSessionCommits,
    fetchSessionToolMetrics,
    fetchDayToolMetrics,
    costOptimization,
    fetchCostOptimization,
    releases,
    fetchReleases,
    fetchCombinedData,
    fetchQualityMetrics,
    fetchDeploymentFrequency,
    fetchReleaseQuality,
    tokenBudgets,
  };
}
