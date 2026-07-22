/**
 * AnalyticsPanel 周辺の Props・型エイリアス・interface を集約。
 * 元 components/AnalyticsPanel.tsx から本フェーズで分離。
 */
import type React from 'react';
import type {
  AnalyticsData,
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../domain/parser/types';
import type {
  QualityMetrics,
  DateRange,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';

export interface AnalyticsPanelProps {
  readonly releases?: readonly TrailRelease[];
  readonly analytics: AnalyticsData | null;
  readonly sessions?: readonly TrailSession[];
  readonly onSelectSession?: (id: string) => void;
  readonly onJumpToTrace?: (session: TrailSession) => void;
  readonly fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  readonly fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  readonly fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  readonly fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  readonly costOptimization?: CostOptimizationData | null;
  readonly fetchCombinedData?: (period: CombinedPeriodMode, rangeDays: CombinedRangeDays) => Promise<CombinedData>;
  readonly fetchQualityMetrics?: (range: DateRange) => Promise<QualityMetrics | null>;
  readonly fetchDeploymentFrequency?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<{ bucketStart: string; value: number }>>;
  readonly fetchReleaseQuality?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<ReleaseQualityBucket>>;
  readonly onOpenReleasesPopup?: () => void;
  readonly onOpenPromptsPopup?: () => void;
  readonly onOpenMessagesPopup?: () => void;
  readonly sessionsLoading?: boolean;
}

export interface MetricItem {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly badge?: { readonly label: string; readonly color: string };
  readonly delta?: { readonly text: string; readonly color: string };
  readonly tooltip?: string;
}

export interface CommitMarkerData {
  readonly turn: number;
  readonly agentLabel: string;
  readonly commitHash: string;
  readonly commitPrefix: string;
}

export interface ErrorMarkerData {
  readonly turn: number;
  readonly agentLabel: string;
  readonly toolName: string;
}

export type DailyViewMode = 'tokens' | 'cost' | 'loc';
/** 表示期間の日数。数値入力で任意日数を受けるため union ではなく number（有効範囲は periodSelection.ts）。 */
export type PeriodDays = number;
/** 棒グラフの集計単位。期間日数から暗黙に決めず、ユーザーのトグルが単一の決定要因になる。 */
export type BucketUnit = 'day' | 'week';
export type SessionToolMetric = 'count' | 'tokens' | 'duration';
export type ChartMetric = 'count' | 'tokens';
export type ToolChartMetric = 'count' | 'tokens' | 'error';
export type CombinedChartKind = 'tools' | 'skills' | 'models' | 'agents' | 'commits' | 'releases';
export type AgentMetric = 'tokens' | 'cost' | 'loc';
export type CommitMetric = 'count' | 'cumulative' | 'loc' | 'leadTime';
export type CombinedMetric = 'tokens' | 'tools' | 'skills' | 'models' | 'agents' | 'commits' | 'releases';
