import { splitEpisodes, Message } from '../../src/canonical/splitEpisodes';

function msg(
  uuid: string,
  session_id: string,
  type: Message['type'],
  text_excerpt: string,
  timestamp?: string,
): Message {
  return {
    uuid,
    session_id,
    type,
    timestamp: timestamp ?? `2024-01-01T00:00:0${uuid}.000Z`,
    text_excerpt,
  };
}

describe('splitEpisodes', () => {
  it('returns empty array for empty input', () => {
    expect(splitEpisodes([])).toEqual([]);
  });

  it('splits [user, assistant, user, assistant, assistant] into 2 blocks', () => {
    const messages: Message[] = [
      msg('1', 's1', 'user', 'q1', '2024-01-01T00:00:01.000Z'),
      msg('2', 's1', 'assistant', 'a1', '2024-01-01T00:00:02.000Z'),
      msg('3', 's1', 'user', 'q2', '2024-01-01T00:00:03.000Z'),
      msg('4', 's1', 'assistant', 'a2', '2024-01-01T00:00:04.000Z'),
      msg('5', 's1', 'assistant', 'a3', '2024-01-01T00:00:05.000Z'),
    ];
    const episodes = splitEpisodes(messages);
    expect(episodes).toHaveLength(2);

    expect(episodes[0].message_uuid_start).toBe('1');
    expect(episodes[0].message_uuid_end).toBe('2');
    expect(episodes[0].valid_from).toBe('2024-01-01T00:00:01.000Z');
    expect(episodes[0].session_id).toBe('s1');

    expect(episodes[1].message_uuid_start).toBe('3');
    expect(episodes[1].message_uuid_end).toBe('5');
    expect(episodes[1].valid_from).toBe('2024-01-01T00:00:03.000Z');
  });

  it('discards leading assistant/system messages before first user message', () => {
    const messages: Message[] = [
      msg('1', 's1', 'system', 'sys-msg', '2024-01-01T00:00:01.000Z'),
      msg('2', 's1', 'assistant', 'pre-a', '2024-01-01T00:00:02.000Z'),
      msg('3', 's1', 'user', 'q1', '2024-01-01T00:00:03.000Z'),
      msg('4', 's1', 'assistant', 'a1', '2024-01-01T00:00:04.000Z'),
    ];
    const episodes = splitEpisodes(messages);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].message_uuid_start).toBe('3');
  });

  it('separates blocks by session boundary', () => {
    const messages: Message[] = [
      msg('1', 's1', 'user', 'q1', '2024-01-01T00:00:01.000Z'),
      msg('2', 's1', 'assistant', 'a1', '2024-01-01T00:00:02.000Z'),
      msg('3', 's2', 'user', 'q2', '2024-01-01T00:00:03.000Z'),
      msg('4', 's2', 'assistant', 'a2', '2024-01-01T00:00:04.000Z'),
    ];
    const episodes = splitEpisodes(messages);
    expect(episodes).toHaveLength(2);
    expect(episodes[0].session_id).toBe('s1');
    expect(episodes[1].session_id).toBe('s2');
  });

  it('handles a single user message as a 1-block episode', () => {
    const messages: Message[] = [
      msg('1', 's1', 'user', 'hello', '2024-01-01T00:00:01.000Z'),
    ];
    const episodes = splitEpisodes(messages);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].message_uuid_start).toBe('1');
    expect(episodes[0].message_uuid_end).toBe('1');
  });

  it('builds raw_excerpt by joining text_excerpts with \\n---\\n', () => {
    const messages: Message[] = [
      msg('1', 's1', 'user', 'question', '2024-01-01T00:00:01.000Z'),
      msg('2', 's1', 'assistant', 'answer', '2024-01-01T00:00:02.000Z'),
    ];
    const [episode] = splitEpisodes(messages);
    expect(episode.raw_excerpt).toBe('question\n---\nanswer');
  });

  it('truncates raw_excerpt to 4096 bytes', () => {
    const longText = 'x'.repeat(3000);
    const messages: Message[] = [
      msg('1', 's1', 'user', longText, '2024-01-01T00:00:01.000Z'),
      msg('2', 's1', 'assistant', longText, '2024-01-01T00:00:02.000Z'),
    ];
    const [episode] = splitEpisodes(messages);
    expect(Buffer.byteLength(episode.raw_excerpt, 'utf8')).toBeLessThanOrEqual(4096);
  });

  it('session boundary also splits a block mid-flow (not crossing sessions)', () => {
    const messages: Message[] = [
      msg('1', 's1', 'user', 'q1', '2024-01-01T00:00:01.000Z'),
      msg('2', 's2', 'user', 'q2', '2024-01-01T00:00:02.000Z'),
      msg('3', 's2', 'assistant', 'a2', '2024-01-01T00:00:03.000Z'),
    ];
    const episodes = splitEpisodes(messages);
    expect(episodes).toHaveLength(2);
    expect(episodes[0].message_uuid_start).toBe('1');
    expect(episodes[0].message_uuid_end).toBe('1');
    expect(episodes[1].message_uuid_start).toBe('2');
    expect(episodes[1].message_uuid_end).toBe('3');
  });
});
