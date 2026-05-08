import { Database } from 'sql.js';
import type { Message } from '../../canonical/splitEpisodes';

/**
 * Reads messages from the ATTACHed trail DB (alias "trail") that have
 * timestamp >= sinceISO, grouped by session_id.
 *
 * Assumes trail.sessions and trail.messages are already ATTACHed via
 * attachTrailDbFromHandle / attachTrailDbReadOnly.
 */
export function* readMessagesSince(
  db: Database,
  sinceISO: string
): Generator<{ session_id: string; messages: Message[] }> {
  // Collect all qualifying messages, ordered so we can group by session
  const stmt = db.prepare(
    `SELECT
       m.uuid,
       m.session_id,
       m.type,
       m.timestamp,
       m.message_excerpt AS text_excerpt
     FROM trail.messages m
     JOIN trail.sessions s ON s.id = m.session_id
     WHERE m.timestamp IS NOT NULL
       AND m.timestamp >= ?
       AND m.type IN ('user', 'assistant', 'system')
     ORDER BY m.session_id, m.timestamp`
  );
  stmt.bind([sinceISO]);

  const sessionMap = new Map<string, Message[]>();

  while (stmt.step()) {
    const row = stmt.getAsObject();
    const uuid = row['uuid'] as string;
    const session_id = row['session_id'] as string;
    const rawType = row['type'] as string;
    const timestamp = row['timestamp'] as string;
    const text_excerpt = (row['text_excerpt'] as string | null) ?? '';

    // Narrow type to the union accepted by Message
    if (rawType !== 'user' && rawType !== 'assistant' && rawType !== 'system') {
      continue;
    }
    const type: 'user' | 'assistant' | 'system' = rawType;

    let bucket = sessionMap.get(session_id);
    if (bucket === undefined) {
      bucket = [];
      sessionMap.set(session_id, bucket);
    }
    bucket.push({ uuid, session_id, type, timestamp, text_excerpt });
  }
  stmt.free();

  for (const [session_id, messages] of sessionMap) {
    yield { session_id, messages };
  }
}
