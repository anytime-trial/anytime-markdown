// SqliteSessionRepository.ts — ISessionRepository implementation using sql.js

import type { Database } from 'sql.js';
import type {
  ISessionRepository,
  SessionStats,
} from '@anytime-markdown/trail-core';

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
}
