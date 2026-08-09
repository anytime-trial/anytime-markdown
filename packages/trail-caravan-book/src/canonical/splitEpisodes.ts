const MAX_EXCERPT_BYTES = 2048;

export interface Message {
  uuid: string;
  session_id: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  text_excerpt: string;
}

export interface Episode {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  valid_from: string;
  raw_excerpt: string;
}

/**
 * Truncates a string so its UTF-8 byte length does not exceed maxBytes.
 */
function truncateToBytes(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8');
  if (buf.byteLength <= maxBytes) return str;
  return buf.subarray(0, maxBytes).toString('utf8').replace(/�$/, '');
}

/**
 * Splits a flat message list into episodes.
 * Each episode starts at a 'user' message and ends just before the next 'user'
 * message in the same session. Leading non-user messages are discarded.
 *
 * Blocks whose messages carry no text at all are dropped. trail.activity_messages keeps
 * tool results in 'user' rows with an empty user_content (328,662 of 352,212
 * user rows as of 2026-08-06). Joining those produced episodes whose
 * raw_excerpt was nothing but '\n---\n' separators — 84,365 of 126,101 stored
 * episodes (67%) — which the LLM extractor then had to read and reject.
 *
 * **現在の唯一の呼び出し経路（`readMessagesSince` / `reconstructEpisode`）は
 * user 行しか渡さない**（`ingest/conversation/messageFilter.ts` の
 * `ingestTargetSql`）。そのためブロックは 1 メッセージずつになり、
 * `message_uuid_start === message_uuid_end` が成り立つ。assistant / system を
 * 扱う分岐と `Message.type` の union はその形状を型で禁じていないだけで、本番
 * では到達しない。上の件数はいずれも user 行のみへ絞る前の実測値である。
 */
export function splitEpisodes(messages: Message[]): Episode[] {
  const episodes: Episode[] = [];

  // Group messages by session, preserving order within each session.
  const sessionMap = new Map<string, Message[]>();
  for (const m of messages) {
    let bucket = sessionMap.get(m.session_id);
    if (bucket === undefined) {
      bucket = [];
      sessionMap.set(m.session_id, bucket);
    }
    bucket.push(m);
  }

  for (const [session_id, sessionMessages] of sessionMap) {
    // Find the index of the first 'user' message; discard everything before it.
    const firstUserIdx = sessionMessages.findIndex((m) => m.type === 'user');
    if (firstUserIdx === -1) continue; // No user messages → no episodes for this session.

    let blockStart = firstUserIdx;

    for (let i = firstUserIdx + 1; i <= sessionMessages.length; i++) {
      const isNewBlock =
        i === sessionMessages.length || sessionMessages[i].type === 'user';

      if (isNewBlock) {
        const blockMessages = sessionMessages.slice(blockStart, i);
        const firstMsg = blockMessages[0];
        const lastMsg = blockMessages.at(-1) as Message;

        const joined = blockMessages
          .map((m) => m.text_excerpt)
          .filter((text) => text.trim() !== '')
          .join('\n---\n');

        blockStart = i;

        if (joined === '') continue; // 本文ゼロのブロックは episode にしない

        episodes.push({
          session_id,
          message_uuid_start: firstMsg.uuid,
          message_uuid_end: lastMsg.uuid,
          valid_from: firstMsg.timestamp,
          raw_excerpt: truncateToBytes(joined, MAX_EXCERPT_BYTES),
        });
      }
    }
  }

  return episodes;
}
