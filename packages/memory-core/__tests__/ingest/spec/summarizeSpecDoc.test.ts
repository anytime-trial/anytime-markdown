/**
 * Tests for src/ingest/spec/summarizeSpecDoc.ts
 *
 * 文書全体要約の成功・空要約・JSON 失敗・ネットワーク失敗時の振る舞いと、
 * 長い body の truncate を検証する。
 */
import { summarizeSpecDoc } from '../../../src/ingest/spec/summarizeSpecDoc';
import { SPEC_SUMMARY_BODY_MAX_CHARS } from '../../../src/ollama/prompts/spec';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { MemoryLogger } from '../../../src/logger';

function makeLogger(): MemoryLogger & { errors: unknown[]; warns: string[] } {
  const errors: unknown[] = [];
  const warns: string[] = [];
  return {
    info: jest.fn(),
    error: jest.fn((_msg: string, err?: unknown) => { errors.push(err); }),
    warn: jest.fn((msg: string) => { warns.push(msg); }),
    errors,
    warns,
  };
}

/** generate の引数を記録しつつ任意の response / throw を返す mock ollama。 */
function makeOllama(
  impl: (args: { prompt: string }) => { response: string } | Promise<{ response: string }>,
): OllamaClient & { lastPrompt: string } {
  const holder = { lastPrompt: '' };
  const client = {
    generate: jest.fn(async (args: { prompt: string }) => {
      holder.lastPrompt = args.prompt;
      return impl(args);
    }),
  } as unknown as OllamaClient & { lastPrompt: string };
  Object.defineProperty(client, 'lastPrompt', { get: () => holder.lastPrompt });
  return client;
}

describe('summarizeSpecDoc', () => {
  test('returns trimmed summary from valid JSON response', async () => {
    const ollama = makeOllama(() => ({
      response: JSON.stringify({ summary: '  本文書は memory-core の要件を定義する。  ' }),
    }));
    const result = await summarizeSpecDoc({
      title: 'Memory Core 要件定義書',
      body: '本文...',
      ollama,
      logger: makeLogger(),
    });
    expect(result).toBe('本文書は memory-core の要件を定義する。');
  });

  test('passes title and full body to the prompt', async () => {
    const ollama = makeOllama(() => ({ response: JSON.stringify({ summary: 'ok' }) }));
    await summarizeSpecDoc({
      title: 'My Title',
      body: 'first paragraph\nsecond paragraph',
      ollama,
      logger: makeLogger(),
    });
    expect(ollama.lastPrompt).toContain('My Title');
    expect(ollama.lastPrompt).toContain('second paragraph');
  });

  test('truncates long body to SPEC_SUMMARY_BODY_MAX_CHARS', async () => {
    const ollama = makeOllama(() => ({ response: JSON.stringify({ summary: 'ok' }) }));
    const longBody = 'あ'.repeat(SPEC_SUMMARY_BODY_MAX_CHARS + 500);
    await summarizeSpecDoc({ title: 't', body: longBody, ollama, logger: makeLogger() });
    expect(ollama.lastPrompt).toContain('…(以下省略)');
    // 本文セクションは打ち切られているので元の全長は含まれない
    expect(ollama.lastPrompt).not.toContain('あ'.repeat(SPEC_SUMMARY_BODY_MAX_CHARS + 1));
  });

  test('returns null and warns on empty summary', async () => {
    const logger = makeLogger();
    const ollama = makeOllama(() => ({ response: JSON.stringify({ summary: '   ' }) }));
    const result = await summarizeSpecDoc({ title: 't', body: 'b', ollama, logger });
    expect(result).toBeNull();
    expect(logger.warns.some((w) => w.includes('empty summary'))).toBe(true);
  });

  test('returns null and logs error on invalid JSON', async () => {
    const logger = makeLogger();
    const ollama = makeOllama(() => ({ response: 'not json {' }));
    const result = await summarizeSpecDoc({ title: 't', body: 'b', ollama, logger });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test('returns null and logs error on generate failure', async () => {
    const logger = makeLogger();
    const ollama = makeOllama(() => { throw new Error('ECONNREFUSED'); });
    const result = await summarizeSpecDoc({ title: 't', body: 'b', ollama, logger });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
