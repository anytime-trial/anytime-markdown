import type { SessionRow, MessageRow, SessionCommitRow } from './TrailDatabase';

export interface IRemoteTrailStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  getExistingSessionIds(): Promise<readonly string[]>;
  getExistingSyncedAt(): Promise<ReadonlyMap<string, string>>;
  upsertSessions(rows: readonly SessionRow[]): Promise<void>;
  upsertMessages(rows: readonly MessageRow[]): Promise<void>;
  upsertCommits(rows: readonly SessionCommitRow[]): Promise<void>;
}
