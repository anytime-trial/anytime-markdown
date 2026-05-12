import { buildPrompt, type PromptSource } from '../../src/chat/promptBuilder';

function entitySource(id: string, name = id): PromptSource {
  return {
    kind: 'entity',
    id,
    type: 'Function',
    sources: ['bm25', 'vec'],
    display_name: name,
    summary: `${name} の要約`,
    aliases: [`${name}_alias`],
  };
}

describe('buildPrompt', () => {
  test('system + context + user の最小構成を生成', () => {
    const messages = buildPrompt({
      query: 'searchMemory は何をする?',
      history: [],
      sources: [entitySource('e1', 'searchMemory')],
    });
    expect(messages[0].role).toBe('system');
    expect(messages.some((m) => m.content.includes('<source id="entity:e1"'))).toBe(true);
    expect(messages.at(-1)?.role).toBe('user');
    expect(messages.at(-1)?.content).toContain('searchMemory は何をする?');
  });

  test('source ブロックが sourceLimit で切り詰められる', () => {
    const sources: PromptSource[] = Array.from({ length: 30 }, (_, i) =>
      entitySource(`e${i}`),
    );
    const messages = buildPrompt({
      query: 'q',
      history: [],
      sources,
      sourceLimit: 5,
    });
    const contextMsg = messages.find((m) => m.content.includes('<source'));
    const count = (contextMsg?.content.match(/<source /g) ?? []).length;
    expect(count).toBe(5);
  });

  test('history は historyLimit 件で古い側から切り詰められる', () => {
    const history = Array.from(
      { length: 10 },
      (_, i) =>
        ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `h${i}`,
        }) as const,
    );
    const messages = buildPrompt({
      query: 'q',
      history,
      sources: [],
      historyLimit: 6,
    });
    const historyMessages = messages.filter(
      (m) => m.role !== 'system' && m.content !== 'q',
    );
    expect(historyMessages.length).toBeLessThanOrEqual(6);
    expect(historyMessages[0].content).toBe('h4'); // 古い側 h0-h3 が捨てられる
  });

  test('episode と drift の source も render される', () => {
    const messages = buildPrompt({
      query: 'q',
      history: [],
      sources: [
        { kind: 'episode', id: 's1', sources: ['vec'], excerpt: '会話抜粋' },
        { kind: 'drift', id: 'd1', sources: ['bm25'], summary: 'drift detail' },
      ],
    });
    const contextMsg = messages.find((m) => m.content.includes('<source'));
    expect(contextMsg?.content).toContain('<source id="episode:s1"');
    expect(contextMsg?.content).toContain('<source id="drift:d1"');
  });

  test('引用フォーマット指示が system に含まれる', () => {
    const messages = buildPrompt({ query: 'q', history: [], sources: [] });
    const systemMessages = messages.filter((m) => m.role === 'system');
    const combined = systemMessages.map((m) => m.content).join('\n');
    expect(combined).toMatch(/\[\^entity:/);
  });
});
