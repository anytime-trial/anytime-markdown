import { useCallback } from 'react';

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
} from '../domain/parser/types';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';

import { useAnalyticsData } from './useAnalyticsData';
import { usePromptsData } from './usePromptsData';
import { useReleasesData } from './useReleasesData';
import { useSessionsData } from './useSessionsData';
import { useTokenBudgetsWs } from './useTokenBudgetsWs';

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { TokenBudgetStatus } from './useTokenBudgetsWs';

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface TrailDataSourceResult {
  readonly sessions: readonly TrailSession[];
  readonly allSessions: readonly TrailSession[];
  readonly messages: readonly TrailMessage[];
  readonly prompts: readonly TrailPromptEntry[];
  readonly analytics: AnalyticsData | null;
  readonly connected: boolean;
  readonly loading: boolean;
  readonly sessionsLoading: boolean;
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
  readonly tokenBudgets: readonly import('./useTokenBudgetsWs').TokenBudgetStatus[];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Composes the five domain-specific sub-hooks into the original
 * `TrailDataSourceResult` shape. The public surface (return type and parameter
 * signature) is preserved so that `TrailViewerApp` and downstream consumers
 * importing from `@anytime-markdown/trail-viewer` keep working unchanged.
 */
export interface UseTrailDataSourceOptions {
  /**
   * prompts データの取得を有効化するか。プロンプトポップアップ初回オープンまで
   * `false` にすることで起動時の `/api/trail/prompts` 取得を遅延する。既定 true。
   */
  readonly promptsEnabled?: boolean;
}

export function useTrailDataSource(
  serverUrl: string,
  options?: UseTrailDataSourceOptions,
): TrailDataSourceResult {
  const sessions = useSessionsData(serverUrl);
  const analytics = useAnalyticsData(serverUrl);
  const releases = useReleasesData(serverUrl);
  const prompts = usePromptsData(serverUrl, options?.promptsEnabled ?? true);

  // Bridge the WS `sessions-updated` event to the sessions + analytics
  // sub-hooks, reproducing the cross-cutting refresh that the original
  // useTrailDataSource performed inside its WS handler.
  const handleSessionsUpdated = useCallback(() => {
    void sessions.refetchAll();
    void analytics.refresh();
  }, [sessions, analytics]);

  const tokens = useTokenBudgetsWs(serverUrl, {
    onSessionsUpdated: handleSessionsUpdated,
  });

  return {
    // sessions / messages
    sessions: sessions.sessions,
    allSessions: sessions.allSessions,
    sessionsLoading: sessions.sessionsLoading,
    messages: sessions.messages,
    loadSession: sessions.loadSession,
    searchSessions: sessions.searchSessions,
    fetchSessionMessages: sessions.fetchSessionMessages,
    fetchSessionCommits: sessions.fetchSessionCommits,

    // analytics / cost
    analytics: analytics.analytics,
    costOptimization: analytics.costOptimization,
    fetchCombinedData: analytics.fetchCombinedData,
    fetchSessionToolMetrics: analytics.fetchSessionToolMetrics,
    fetchDayToolMetrics: analytics.fetchDayToolMetrics,
    fetchCostOptimization: analytics.fetchCostOptimization,

    // releases / quality
    releases: releases.releases,
    fetchReleases: releases.fetchReleases,
    fetchQualityMetrics: releases.fetchQualityMetrics,
    fetchDeploymentFrequency: releases.fetchDeploymentFrequency,
    fetchReleaseQuality: releases.fetchReleaseQuality,

    // ws / tokens
    connected: tokens.connected,
    tokenBudgets: tokens.tokenBudgets,

    // prompts
    prompts: prompts.prompts,

    // cross-cutting (owned by useSessionsData since only session ops mutate them)
    loading: sessions.loading,
    error: sessions.error,
  };
}
