import type { CaravanDbConnection } from '../../db/connection/types';
import type { CaravanLogger } from '../../logger';

export interface LinkRootCauseInput {
  db: CaravanDbConnection;
  bugFixId: string;
  sessionId: string | null;
  committedAt: string;
  logger: CaravanLogger;
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
      `SELECT id FROM caravan_episodes
       WHERE session_id = ? AND valid_from <= ?
       ORDER BY valid_from DESC LIMIT 1`,
      [sessionId, committedAt]
    );
    const val = result[0]?.values?.[0]?.[0];
    episodeId = typeof val === 'string' ? val : null;
  } catch (err) {
    logger.error(
      `[anytime-memory] linkRootCauseEpisode: failed to query episodes for session=${sessionId}`,
      err
    );
    return { root_cause_episode_id: null };
  }

  if (!episodeId) {
    return { root_cause_episode_id: null };
  }

  try {
    db.run(
      `UPDATE caravan_bug_fixes SET root_cause_episode_id = ? WHERE id = ?`,
      [episodeId, bugFixId]
    );
  } catch (err) {
    logger.error(
      `[anytime-memory] linkRootCauseEpisode: failed to update bug_fix id=${bugFixId}`,
      err
    );
  }

  return { root_cause_episode_id: episodeId };
}

/**
 * `root_cause_episode_id IS NULL` の既存行を再リンクする（spec memory-core §6.7）。
 *
 * bug_history 取込の時点では当該セッションの会話 episode がまだ取込まれていない
 * ことが常態（実測 17 / 1,369）のため、episode が後から届いた後に増分取込の
 * 冒頭で毎回呼ぶ。冪等で、リンク先が見つからない行は NULL のまま残る。
 * 失敗しても取込本体は止めない（fail-open・補助機構）。
 */
export function relinkNullRootCauseEpisodes(
  db: CaravanDbConnection,
  opts: { workspace: string; logger: CaravanLogger },
): number {
  try {
    db.run(
      `UPDATE caravan_bug_fixes
          SET root_cause_episode_id = (
            SELECT me.id FROM caravan_episodes me
             WHERE me.session_id = caravan_bug_fixes.related_session_id
               AND me.valid_from <= caravan_bug_fixes.committed_at
             ORDER BY me.valid_from DESC LIMIT 1)
        WHERE root_cause_episode_id IS NULL
          AND related_session_id IS NOT NULL
          AND workspace = ?
          AND EXISTS (
            SELECT 1 FROM caravan_episodes me2
             WHERE me2.session_id = caravan_bug_fixes.related_session_id
               AND me2.valid_from <= caravan_bug_fixes.committed_at)`,
      [opts.workspace],
    );
    return db.getRowsModified();
  } catch (err) {
    opts.logger.error(
      `[anytime-memory] relinkNullRootCauseEpisodes: failed for workspace=${opts.workspace}`,
      err,
    );
    return 0;
  }
}
