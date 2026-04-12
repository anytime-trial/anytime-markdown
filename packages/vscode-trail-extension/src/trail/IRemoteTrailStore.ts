import type { SessionRow, MessageRow, SessionCommitRow, ReleaseFileRow, ReleaseFeatureRow, ReleaseRow } from './TrailDatabase';

export interface IRemoteTrailStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  getExistingSessionIds(): Promise<readonly string[]>;
  getExistingSyncedAt(): Promise<ReadonlyMap<string, string>>;
  upsertSessions(rows: readonly SessionRow[]): Promise<void>;
  upsertMessages(rows: readonly MessageRow[]): Promise<void>;
  upsertCommits(rows: readonly SessionCommitRow[]): Promise<void>;
  upsertReleases(rows: readonly ReleaseRow[]): Promise<void>;
  upsertReleaseFiles(rows: readonly ReleaseFileRow[]): Promise<void>;
  upsertReleaseFeatures(rows: readonly ReleaseFeatureRow[]): Promise<void>;
  upsertSessionCosts(sessionId: string, costs: readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void>;
  upsertAllSessionCosts(rows: readonly {
    session_id: string;
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
  upsertC4ModelById(id: string, json: string, revision: string): Promise<void>;
}
