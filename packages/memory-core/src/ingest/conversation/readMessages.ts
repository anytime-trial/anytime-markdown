import type { MemoryDbConnection } from '../../db/connection/types';
import type { Message } from '../../canonical/splitEpisodes';

/**
 * Lists session_ids (lexicographically) that have at least one qualifying
 * message with timestamp >= sinceISO. Lightweight — only ids are returned,
 * not the message bodies.
 *
 * Assumes trail.sessions and trail.messages are already ATTACHed via
 * attachTrailDbFromHandle / attachTrailDbReadOnly.
 */
export function listSessionIdsSince(
  db: MemoryDbConnection,
  sinceISO: string
): string[] {
  const stmt = db.prepare(
    `SELECT DISTINCT m.session_id
     FROM trail.messages m
     JOIN trail.sessions s ON s.id = m.session_id
     WHERE m.timestamp IS NOT NULL
       AND m.timestamp >= ?
       AND m.type IN ('user', 'assistant', 'system')
     ORDER BY m.session_id`
  );
  try {
    const rows = stmt.all(sinceISO);
    return rows.map((r) => r['session_id'] as string);
  } finally {
    stmt.free?.();
  }
}

/**
 * Returns all qualifying messages for a single session, ordered by timestamp.
 *
 * Assumes trail.sessions and trail.messages are already ATTACHed via
 * attachTrailDbFromHandle / attachTrailDbReadOnly.
 */
export function readMessagesForSession(
  db: MemoryDbConnection,
  sessionId: string,
  sinceISO: string
): Message[] {
  // trail.messages は assistant 行に text_content、user 行に user_content を
  // 入れている (trail-db importSession の規約)。message_excerpt 列は存在しない
  // ため COALESCE(text_content, user_content) で抽出する。
  const stmt = db.prepare(
    `SELECT
       m.uuid,
       m.session_id,
       m.type,
       m.timestamp,
       COALESCE(SUBSTR(m.text_content, 1, 2048),
                SUBSTR(m.user_content, 1, 2048),
                '') AS text_excerpt
     FROM trail.messages m
     WHERE m.session_id = ?
       AND m.timestamp IS NOT NULL
       AND m.timestamp >= ?
       AND m.type IN ('user', 'assistant', 'system')
     ORDER BY m.timestamp`
  );
  try {
    const rows = stmt.all(sessionId, sinceISO);
    const out: Message[] = [];
    for (const row of rows) {
      const rawType = row['type'] as string;
      if (rawType !== 'user' && rawType !== 'assistant' && rawType !== 'system') {
        continue;
      }
      out.push({
        uuid: row['uuid'] as string,
        session_id: row['session_id'] as string,
        type: rawType,
        timestamp: row['timestamp'] as string,
        text_excerpt: (row['text_excerpt'] as string | null) ?? '',
      });
    }
    return out;
  } finally {
    stmt.free?.();
  }
}

/**
 * Reads messages from the ATTACHed trail DB (alias "trail") that have
 * timestamp >= sinceISO, grouped by session_id.
 *
 * Two-phase implementation: first lists session_ids (small), then loads
 * messages for one session at a time on each yield. This keeps memory
 * bounded to a single session's messages instead of the full result set,
 * which matters when the cursor is 30 days behind and the trail DB holds
 * 10k+ qualifying rows.
 *
 * A single long-lived iterator over all rows cannot be used here because
 * better-sqlite3 forbids running other statements on the same connection
 * while an iterator is open ("database connection is busy"), and the caller
 * does heavy DB writes between yields.
 *
 * Assumes trail.sessions and trail.messages are already ATTACHed via
 * attachTrailDbFromHandle / attachTrailDbReadOnly.
 */
export function* readMessagesSince(
  db: MemoryDbConnection,
  sinceISO: string
): Generator<{ session_id: string; messages: Message[] }> {
  const sessionIds = listSessionIdsSince(db, sinceISO);
  for (const session_id of sessionIds) {
    yield { session_id, messages: readMessagesForSession(db, session_id, sinceISO) };
  }
}
