import { chatReducer, initialChatState } from '../chatReducer';

describe('chatReducer', () => {
  test('SEND で user + assistant メッセージが追加され streaming=true', () => {
    const s = chatReducer(initialChatState, { type: 'SEND', query: 'hi' });
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(s.messages[1]).toMatchObject({ role: 'assistant', content: '' });
    expect(s.streaming).toBe(true);
    expect(s.sources).toEqual([]);
  });

  test('TOKEN は最後の assistant メッセージに追記', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'TOKEN', delta: 'Hel' });
    s = chatReducer(s, { type: 'TOKEN', delta: 'lo' });
    expect(s.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Hello' });
  });

  test('SOURCES が state に保存される', () => {
    const sources = [{ id: 'e1', title: 'fn', kind: 'entity' }];
    const s = chatReducer(initialChatState, { type: 'SOURCES', sources });
    expect(s.sources).toEqual(sources);
  });

  test('CITATION は重複追加しない', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'CITATION', tag: 'entity:e1' });
    s = chatReducer(s, { type: 'CITATION', tag: 'entity:e1' });
    expect(s.messages.at(-1)?.citations).toEqual(['entity:e1']);
  });

  test('DONE で streaming=false', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'TOKEN', delta: 'a' });
    s = chatReducer(s, { type: 'DONE', interrupted: false });
    expect(s.streaming).toBe(false);
    expect(s.messages.at(-1)?.interrupted).toBeUndefined();
  });

  test('DONE interrupted=true は assistant メッセージにフラグ付与', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'DONE', interrupted: true });
    expect(s.streaming).toBe(false);
    expect(s.messages.at(-1)?.interrupted).toBe(true);
  });

  test('ABORT で streaming=false + interrupted フラグ付与', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'TOKEN', delta: 'partial' });
    s = chatReducer(s, { type: 'ABORT' });
    expect(s.streaming).toBe(false);
    expect(s.messages.at(-1)?.interrupted).toBe(true);
  });

  test('ERROR で最後の assistant に error 文字列を付与', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'ERROR', message: 'boom' });
    expect(s.messages.at(-1)?.error).toBe('boom');
  });

  test('CLEAR で初期状態に戻る', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', query: 'q' });
    s = chatReducer(s, { type: 'TOKEN', delta: 'x' });
    s = chatReducer(s, { type: 'CLEAR' });
    expect(s).toEqual(initialChatState);
  });
});
