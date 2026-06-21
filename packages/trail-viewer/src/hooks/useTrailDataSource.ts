import { useEffect, useMemo, useReducer } from 'react';

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

import { createTrailDataStore } from './stores/trailDataStore';

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
// Options
// ---------------------------------------------------------------------------

export interface UseTrailDataSourceOptions {
  /**
   * prompts データの取得を有効化するか。プロンプトポップアップ初回オープンまで
   * `false` にすることで起動時の `/api/trail/prompts` 取得を遅延する。既定 true。
   */
  readonly promptsEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Thin adapter hook — delegates all logic to the vanilla TrailDataStore
// ---------------------------------------------------------------------------

export function useTrailDataSource(
  serverUrl: string,
  options?: UseTrailDataSourceOptions,
): TrailDataSourceResult {
  const promptsEnabled = options?.promptsEnabled ?? true;

  const store = useMemo(
    () => createTrailDataStore(serverUrl, { promptsEnabled }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverUrl, promptsEnabled],
  );

  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);

  useEffect(() => store.subscribe(forceUpdate), [store]);
  useEffect(() => () => store.dispose(), [store]);

  return store.getState();
}
