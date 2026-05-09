import type { Database } from 'sql.js';
import type { MemoryLogger } from '../../logger';

export interface LinkRootCauseInput {
  db: Database;
  bugFixId: string;
  sessionId: string | null;
  committedAt: string;
  logger: MemoryLogger;
}

export interface LinkRootCauseResult {
  root_cause_episode_id: string | null;
}

export function linkRootCauseEpisode(input: LinkRootCauseInput): LinkRootCauseResult {
  const { db, bugFixId, sessionId, committedAt, logger } = input;

  if (!sessionId) {
    return { root_cause_episode_id: null };
  }

  let episodeId: string | null = null;
  try {
    const result = db.exec(
      `SELECT id FROM memory_episodes
       WHERE session_id = ? AND valid_from <= ?
       ORDER BY valid_from DESC LIMIT 1`,
      [sessionId, committedAt]
    );
    const val = result[0]?.values?.[0]?.[0];
    episodeId = typeof val === 'string' ? val : null;
  } catch (err) {
    logger.error(
      `[memory-core] linkRootCauseEpisode: failed to query episodes for session=${sessionId}`,
      err
    );
    return { root_cause_episode_id: null };
  }

  if (!episodeId) {
    return { root_cause_episode_id: null };
  }

  try {
    db.run(
      `UPDATE memory_bug_fixes SET root_cause_episode_id = ? WHERE id = ?`,
      [episodeId, bugFixId]
    );
  } catch (err) {
    logger.error(
      `[memory-core] linkRootCauseEpisode: failed to update bug_fix id=${bugFixId}`,
      err
    );
  }

  return { root_cause_episode_id: episodeId };
}
