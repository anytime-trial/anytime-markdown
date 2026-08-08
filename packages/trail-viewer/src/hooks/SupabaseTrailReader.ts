import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../domain/parser/types';
import type {
  AnalyticsData,
  ITrailReader,
  TrailRelease,
} from '@anytime-markdown/trail-activity/domain';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-activity/domain/metrics';
import { SessionReader } from '../data/readers/SessionReader';
import { AnalyticsReader } from '../data/readers/AnalyticsReader';
import { CombinedDataReader } from '../data/readers/CombinedDataReader';
import { C4Reader } from '../data/readers/C4Reader';
import { ReleasesReader } from '../data/readers/ReleasesReader';
import { MetricsReader } from '../data/readers/MetricsReader';

// ---------------------------------------------------------------------------
// Row shapes returned by Supabase (snake_case DB columns)
// data/types.ts に集約。後方互換のため re-export する。
// ---------------------------------------------------------------------------

export type {
  SessionCostDbRow,
  SessionDbRow,
  MessageDbRow,
  CommitDbRow,
} from '../data/types';

// ---------------------------------------------------------------------------
// SupabaseTrailReader
//
// 6 つの Reader クラス（SessionReader / AnalyticsReader / CombinedDataReader /
// C4Reader / ReleasesReader / MetricsReader）への薄いファサード。
// 17 公開メソッドのシグネチャと ITrailReader 契約を維持し、
// `new SupabaseTrailReader(url, anonKey)` の生成形を後方互換のまま残す。
// ---------------------------------------------------------------------------

export class SupabaseTrailReader implements ITrailReader {
  private readonly client: SupabaseClient;
  private readonly sessions: SessionReader;
  private readonly analytics: AnalyticsReader;
  private readonly combined: CombinedDataReader;
  private readonly c4: C4Reader;
  private readonly releases: ReleasesReader;
  private readonly metrics: MetricsReader;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
    this.sessions = new SessionReader(this.client);
    this.analytics = new AnalyticsReader(this.client);
    this.combined = new CombinedDataReader(this.client);
    this.c4 = new C4Reader(this.client);
    this.releases = new ReleasesReader(this.client);
    this.metrics = new MetricsReader(this.client);
  }

  getSessions(filters?: TrailFilter): Promise<readonly TrailSession[]> {
    return this.sessions.getSessions(filters);
  }

  getMessages(sessionId: string): Promise<readonly TrailMessage[]> {
    return this.sessions.getMessages(sessionId);
  }

  getSessionCommits(sessionId: string): Promise<readonly TrailSessionCommit[]> {
    return this.sessions.getSessionCommits(sessionId);
  }

  searchMessages(query: string): Promise<readonly { sessionId: string; uuid: string; snippet: string }[]> {
    return this.sessions.searchMessages(query);
  }

  getC4Model(): Promise<Record<string, unknown> | null> {
    return this.c4.getC4Model();
  }

  getAnalytics(): Promise<AnalyticsData | null> {
    return this.analytics.getAnalytics();
  }

  getCostOptimization(): Promise<CostOptimizationData | null> {
    return this.metrics.getCostOptimization();
  }

  getSessionToolMetrics(sessionId: string): Promise<ToolMetrics | null> {
    return this.combined.getSessionToolMetrics(sessionId);
  }

  getDayToolMetrics(date: string): Promise<ToolMetrics | null> {
    return this.combined.getDayToolMetrics(date);
  }

  getCombinedData(period: CombinedPeriodMode, rangeDays: CombinedRangeDays): Promise<CombinedData | null> {
    return this.combined.getCombinedData(period, rangeDays);
  }

  getReleases(): Promise<readonly TrailRelease[]> {
    return this.releases.getReleases();
  }

  getDeploymentFrequency(
    range: DateRange,
    bucket: 'day' | 'week',
  ): Promise<ReadonlyArray<{ bucketStart: string; value: number }>> {
    return this.releases.getDeploymentFrequency(range, bucket);
  }

  getDeploymentFrequencyQuality(
    range: DateRange,
    bucket: 'day' | 'week',
  ): Promise<ReadonlyArray<ReleaseQualityBucket>> {
    return this.releases.getDeploymentFrequencyQuality(range, bucket);
  }

  getQualityMetrics(range: DateRange): Promise<QualityMetrics> {
    return this.metrics.getQualityMetrics(range);
  }
}
