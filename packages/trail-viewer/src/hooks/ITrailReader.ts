import type {
  ToolMetrics,
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../parser/types';
import type { AnalyticsData } from '../components/AnalyticsPanel';

export interface ITrailReader {
  getSessions(filters?: TrailFilter): Promise<readonly TrailSession[]>;
  getMessages(sessionId: string): Promise<readonly TrailMessage[]>;
  getSessionCommits(sessionId: string): Promise<readonly TrailSessionCommit[]>;
  getAnalytics(): Promise<AnalyticsData | null>;
  getSessionToolMetrics(sessionId: string): Promise<ToolMetrics | null>;
  searchMessages(query: string): Promise<readonly { sessionId: string; uuid: string; snippet: string }[]>;
}
