// domain/reader/ITrailReader.ts — Read-only data access interface

import type {
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
  TrailRelease,
  ToolMetrics,
  AnalyticsData,
  CostOptimizationData,
} from '../model';
import type { DateRange, QualityMetrics } from '../metrics/types';

export interface ITrailReader {
  getSessions(filters?: TrailFilter): Promise<readonly TrailSession[]>;
  getMessages(sessionId: string): Promise<readonly TrailMessage[]>;
  getSessionCommits(sessionId: string): Promise<readonly TrailSessionCommit[]>;
  getReleases(): Promise<readonly TrailRelease[]>;
  getC4Model(): Promise<Record<string, unknown> | null>;
  getAnalytics(): Promise<AnalyticsData | null>;
  getCostOptimization(): Promise<CostOptimizationData | null>;
  getSessionToolMetrics(sessionId: string): Promise<ToolMetrics | null>;
  getDayToolMetrics(date: string): Promise<ToolMetrics | null>;
  searchMessages(query: string): Promise<readonly { sessionId: string; uuid: string; snippet: string }[]>;
  getQualityMetrics(range: DateRange): Promise<QualityMetrics>;
}
