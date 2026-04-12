// domain/reader/ITrailReader.ts — Read-only data access interface

import type {
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
  TrailRelease,
  ToolMetrics,
  AnalyticsData,
} from '../model';

export interface ITrailReader {
  getSessions(filters?: TrailFilter): Promise<readonly TrailSession[]>;
  getMessages(sessionId: string): Promise<readonly TrailMessage[]>;
  getSessionCommits(sessionId: string): Promise<readonly TrailSessionCommit[]>;
  getReleases(): Promise<readonly TrailRelease[]>;
  getC4Model(): Promise<Record<string, unknown> | null>;
  getAnalytics(): Promise<AnalyticsData | null>;
  getSessionToolMetrics(sessionId: string): Promise<ToolMetrics | null>;
  searchMessages(query: string): Promise<readonly { sessionId: string; uuid: string; snippet: string }[]>;
}
