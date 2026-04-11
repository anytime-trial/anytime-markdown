import type { SessionRow, MessageRow, SessionCommitRow } from './TrailDatabase';
import type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from './TaskResolver';

export interface IRemoteTrailStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  getExistingSessionIds(): Promise<readonly string[]>;
  getExistingSyncedAt(): Promise<ReadonlyMap<string, string>>;
  upsertSessions(rows: readonly SessionRow[]): Promise<void>;
  upsertMessages(rows: readonly MessageRow[]): Promise<void>;
  upsertCommits(rows: readonly SessionCommitRow[]): Promise<void>;
  upsertTasks(rows: readonly TaskRow[]): Promise<void>;
  upsertTaskFiles(rows: readonly TaskFileRow[]): Promise<void>;
  upsertTaskC4Elements(rows: readonly TaskC4ElementRow[]): Promise<void>;
  upsertTaskFeatures(rows: readonly TaskFeatureRow[]): Promise<void>;
  upsertSessionCosts(sessionId: string, costs: readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void>;
  upsertDailyCosts(rows: readonly {
    date: string;
    model: string;
    cost_type: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void>;
  upsertC4Model(json: string, revision: string): Promise<void>;
}
