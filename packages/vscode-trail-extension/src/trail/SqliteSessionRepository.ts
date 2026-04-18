// SqliteSessionRepository.ts — ISessionRepository implementation using sql.js

import type { Database } from 'sql.js';
import type {
  ISessionRepository,
  SessionStats,
  MessageCommitInput,
} from '@anytime-markdown/trail-core';
import type { TrailMessageCommit } from '@anytime-markdown/trail-core/domain';

export class SqliteSessionRepository implements ISessionRepository {
  constructor(private readonly db: Database) {}

  getStatsByBranch(branchName: string): SessionStats | null {
    const escaped = branchName.replaceAll("'", "''");
    const result = this.db.exec(`
      SELECT
        COUNT(*) as cnt,
        COALESCE(SUM(input_tokens), 0) as inp,
        COALESCE(SUM(output_tokens), 0) as outp,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read
      FROM sessions
      WHERE git_branch = '${escaped}'
    `);

    if (!result[0]?.values?.[0]) return null;
    const [cnt, inp, outp, cacheRead] = result[0].values[0];

    // Calculate total duration from start_time/end_time
    const durResult = this.db.exec(`
      SELECT COALESCE(SUM(
        CAST((julianday(end_time) - julianday(start_time)) * 86400000 AS INTEGER)
      ), 0) as dur
      FROM sessions
      WHERE git_branch = '${escaped}' AND end_time != '' AND start_time != ''
    `);
    const dur = durResult[0]?.values?.[0]?.[0] ?? 0;

    return {
      sessionCount: cnt as number,
      totalInputTokens: inp as number,
      totalOutputTokens: outp as number,
      totalCacheReadTokens: cacheRead as number,
      totalDurationMs: dur as number,
    };
  }

  insertMessageCommit(input: MessageCommitInput): void {
    this.db.run(
      `INSERT OR IGNORE INTO message_commits (message_uuid, session_id, commit_hash, detected_at, match_confidence)
       VALUES (?, ?, ?, ?, ?)`,
      [input.messageUuid, input.sessionId, input.commitHash, input.detectedAt, input.matchConfidence],
    );
  }

  getMessageCommitsBySession(sessionId: string): readonly TrailMessageCommit[] {
    const result = this.db.exec(
      `SELECT message_uuid, session_id, commit_hash, detected_at, match_confidence
       FROM message_commits WHERE session_id = ?`,
      [sessionId],
    );
    if (!result[0]?.values) return [];
    return result[0].values.map(([messageUuid, sid, commitHash, detectedAt, matchConfidence]) => ({
      messageUuid: messageUuid as string,
      sessionId: sid as string,
      commitHash: commitHash as string,
      detectedAt: detectedAt as string,
      matchConfidence: matchConfidence as TrailMessageCommit['matchConfidence'],
    }));
  }

  markMessageCommitsResolved(sessionId: string, resolvedAt: string): void {
    this.db.run(
      `UPDATE sessions SET message_commits_resolved_at = ? WHERE id = ?`,
      [resolvedAt, sessionId],
    );
  }

  isMessageCommitsResolved(sessionId: string): boolean {
    const result = this.db.exec(
      `SELECT message_commits_resolved_at FROM sessions WHERE id = ?`,
      [sessionId],
    );
    const val = result[0]?.values?.[0]?.[0];
    return typeof val === 'string' && val.length > 0;
  }
}
