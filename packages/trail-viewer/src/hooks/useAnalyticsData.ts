import { useCallback, useEffect, useState } from 'react';

import type {
  AnalyticsData,
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
} from '../domain/parser/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsDataResult {
  readonly analytics: AnalyticsData | null;
  readonly costOptimization: CostOptimizationData | null;
  readonly fetchCombinedData: (
    period: CombinedPeriodMode,
    rangeDays: CombinedRangeDays,
  ) => Promise<CombinedData>;
  readonly fetchSessionToolMetrics: (id: string) => Promise<ToolMetrics | null>;
  readonly fetchDayToolMetrics: (date: string) => Promise<ToolMetrics | null>;
  readonly fetchCostOptimization: () => Promise<CostOptimizationData | null>;
  /**
   * Refresh both analytics and cost optimization. Exposed for the orchestrator
   * to wire up cross-cutting WS events (e.g. `sessions-updated`).
   */
  readonly refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAnalyticsData(serverUrl: string): AnalyticsDataResult {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [costOptimization, setCostOptimization] = useState<CostOptimizationData | null>(null);

  const baseUrl = serverUrl;

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

  const fetchCombinedData = useCallback(
    async (period: CombinedPeriodMode, rangeDays: CombinedRangeDays): Promise<CombinedData> => {
      const empty: CombinedData = {
        toolCounts: [],
        errorRate: [],
        skillStats: [],
        modelStats: [],
        agentStats: [],
        commitPrefixStats: [],
        aiFirstTryRate: [],
        repoStats: [],
        qualityRates: [],
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

  const refresh = useCallback(
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

  // Initial fetch
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    analytics,
    costOptimization,
    fetchCombinedData,
    fetchSessionToolMetrics,
    fetchDayToolMetrics,
    fetchCostOptimization,
    refresh,
  };
}
