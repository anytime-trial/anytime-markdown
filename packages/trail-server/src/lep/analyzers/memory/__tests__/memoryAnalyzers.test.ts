import type {
  AnalyzerContext,
  AnalyzerEvent,
  MemoryDbSession,
  ScopeResult,
} from '@anytime-markdown/memory-core';

import { topoSortByDependsOn } from '@anytime-markdown/memory-core';

import { BugHistoryMemoryAnalyzer } from '../BugHistoryMemoryAnalyzer';
import { CodeMemoryAnalyzer } from '../CodeMemoryAnalyzer';
import { ConversationMemoryAnalyzer } from '../ConversationMemoryAnalyzer';
import { DriftMemoryAnalyzer } from '../DriftMemoryAnalyzer';
import { EmbeddingBackfillAnalyzer } from '../EmbeddingBackfillAnalyzer';
import { MemoryWaveSessionProvider } from '../MemoryWaveSessionProvider';
import { ReviewFindingMemoryAnalyzer } from '../ReviewFindingMemoryAnalyzer';
import { SpecMemoryAnalyzer } from '../SpecMemoryAnalyzer';
import { MemoryAnalyzerBase } from '../MemoryAnalyzerBase';

function ok(scope: string): ScopeResult {
  return { scope, status: 'ok', itemsProcessed: 0, itemsFailed: 0 };
}

/** 7 scope メソッドの呼び出しを記録する fake session。 */
function makeFakeSession(overrides: Partial<Record<keyof MemoryDbSession, () => Promise<ScopeResult>>> = {}) {
  const calls: string[] = [];
  let closed = false;
  const session = {
    runConversation: async () => (calls.push('conversation'), ok('conversation_incremental')),
    runCode: async () => (calls.push('code'), ok('code_incremental')),
    runBugHistory: async () => (calls.push('bugHistory'), ok('bug_history_incremental')),
    runReview: async () => (calls.push('review'), ok('review_incremental')),
    runSpec: async () => (calls.push('spec'), ok('spec_incremental')),
    runDrift: async () => (calls.push('drift'), ok('drift_detection')),
    runEmbeddingBackfill: async () => (calls.push('embedding'), ok('embedding_backfill')),
    close: () => {
      closed = true;
    },
    ...overrides,
  } as unknown as MemoryDbSession;
  return { session, calls, isClosed: () => closed };
}

function makeCtx(): AnalyzerContext {
  return {
    runId: 'test-run',
    reason: 'manual',
    logger: { info: () => {}, error: () => {} },
    bus: { publish: async () => {} },
  };
}

const primaryEvent: AnalyzerEvent = { kind: 'wave_complete', wave: 'primary' };

describe('memory analyzers', () => {
  it('each analyzer calls its own scope method on wave_complete:primary', async () => {
    const { session, calls } = makeFakeSession();
    const provider = new MemoryWaveSessionProvider(async () => session);
    const ctx = makeCtx();

    await new ConversationMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new CodeMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new BugHistoryMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new ReviewFindingMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new SpecMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new DriftMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new EmbeddingBackfillAnalyzer(provider).onEvent(primaryEvent, ctx);

    expect(calls).toEqual(['conversation', 'code', 'bugHistory', 'review', 'spec', 'drift', 'embedding']);
  });

  it('ignores non-primary wave_complete and other events', async () => {
    const { session, calls } = makeFakeSession();
    const provider = new MemoryWaveSessionProvider(async () => session);
    const ctx = makeCtx();
    const a = new ConversationMemoryAnalyzer(provider);

    await a.onEvent({ kind: 'wave_complete', wave: 'sources' }, ctx);
    await a.onEvent({ kind: 'wave_complete', wave: 'memory' }, ctx);
    await a.onEvent({ kind: 'session_imported', sessionId: 's', messageCount: 1, repoName: 'r' }, ctx);
    expect(calls).toEqual([]);
  });

  it('throws when scope result status is error', async () => {
    const { session } = makeFakeSession({
      runDrift: async () => ({ scope: 'drift_detection', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: 'boom' }),
    });
    const provider = new MemoryWaveSessionProvider(async () => session);
    await expect(new DriftMemoryAnalyzer(provider).onEvent(primaryEvent, makeCtx())).rejects.toThrow('boom');
  });

  it('skips silently when session factory returns null (trail.db missing)', async () => {
    const provider = new MemoryWaveSessionProvider(async () => null);
    await expect(new CodeMemoryAnalyzer(provider).onEvent(primaryEvent, makeCtx())).resolves.toBeUndefined();
  });

  it('all analyzers share one session (factory called once)', async () => {
    const { session } = makeFakeSession();
    let factoryCalls = 0;
    const provider = new MemoryWaveSessionProvider(async () => {
      factoryCalls++;
      return session;
    });
    const ctx = makeCtx();
    const analyzers: MemoryAnalyzerBase[] = [
      new ConversationMemoryAnalyzer(provider),
      new CodeMemoryAnalyzer(provider),
      new DriftMemoryAnalyzer(provider),
    ];
    for (const a of analyzers) await a.onEvent(primaryEvent, ctx);
    expect(factoryCalls).toBe(1);
  });

  it('provider.closeIfOpen closes the session exactly once', () => {
    const { session, isClosed } = makeFakeSession();
    const provider = new MemoryWaveSessionProvider(async () => session);
    return provider.ensure().then(() => {
      expect(provider.isOpen).toBe(true);
      provider.closeIfOpen();
      expect(isClosed()).toBe(true);
      expect(provider.isOpen).toBe(false);
      provider.closeIfOpen(); // 2 回目は no-op
    });
  });

  it('LLM-dependent analyzers skip when embedding unavailable; LLM-free analyzers run', async () => {
    const { session, calls } = makeFakeSession();
    const checker = async () => ({ ollama_chat: { ok: true }, ollama_embedding: { ok: false, detail: 'not pulled' } });
    const provider = new MemoryWaveSessionProvider(async () => session, checker, 'http://localhost:11434');
    const ctx = makeCtx();

    // chat+embedding 依存 → skip
    await new ConversationMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new ReviewFindingMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new SpecMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    // embedding-only 依存 → skip
    await new EmbeddingBackfillAnalyzer(provider).onEvent(primaryEvent, ctx);
    // LLM 非依存 → 実行
    await new CodeMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new BugHistoryMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new DriftMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);

    expect(calls).toEqual(['code', 'bugHistory', 'drift']);
  });

  it('Ollama completely unavailable: only Code/BugHistory/Drift run', async () => {
    const { session, calls } = makeFakeSession();
    const checker = async () => ({
      ollama_chat: { ok: false, detail: 'ECONNREFUSED' },
      ollama_embedding: { ok: false, detail: 'ECONNREFUSED' },
    });
    const provider = new MemoryWaveSessionProvider(async () => session, checker);
    const ctx = makeCtx();
    for (const A of [
      ConversationMemoryAnalyzer,
      CodeMemoryAnalyzer,
      BugHistoryMemoryAnalyzer,
      ReviewFindingMemoryAnalyzer,
      SpecMemoryAnalyzer,
      DriftMemoryAnalyzer,
      EmbeddingBackfillAnalyzer,
    ]) {
      await new A(provider).onEvent(primaryEvent, ctx);
    }
    expect(calls).toEqual(['code', 'bugHistory', 'drift']);
  });

  it('emits wave_skipped when an LLM analyzer is skipped (cursor protected — scope not run)', async () => {
    const { session, calls } = makeFakeSession();
    const checker = async () => ({ ollama_chat: { ok: false }, ollama_embedding: { ok: false } });
    const provider = new MemoryWaveSessionProvider(async () => session, checker);
    const published: AnalyzerEvent[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r',
      reason: 'manual',
      logger: { info: () => {}, error: () => {} },
      bus: { publish: async (e) => void published.push(e) },
    };
    await new ConversationMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    expect(calls).toEqual([]); // scope 未実行 = cursor 保護
    expect(published.some((e) => e.kind === 'wave_skipped')).toBe(true);
  });

  it('no LLM gating when availability checker is absent (all run)', async () => {
    const { session, calls } = makeFakeSession();
    const provider = new MemoryWaveSessionProvider(async () => session); // checker 省略
    const ctx = makeCtx();
    await new ConversationMemoryAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new EmbeddingBackfillAnalyzer(provider).onEvent(primaryEvent, ctx);
    expect(calls).toEqual(['conversation', 'embedding']);
  });

  it('tier and subscribes are correct (tier 3, wave_complete)', () => {
    const provider = new MemoryWaveSessionProvider(async () => null);
    const a = new ConversationMemoryAnalyzer(provider);
    expect(a.tier).toBe(3);
    expect(a.subscribes).toEqual(['wave_complete']);
  });

  it('dependsOn ordering: Drift after content, EmbeddingBackfill last', () => {
    const provider = new MemoryWaveSessionProvider(async () => null);
    const analyzers = [
      new EmbeddingBackfillAnalyzer(provider),
      new DriftMemoryAnalyzer(provider),
      new ConversationMemoryAnalyzer(provider),
      new CodeMemoryAnalyzer(provider),
      new BugHistoryMemoryAnalyzer(provider),
      new ReviewFindingMemoryAnalyzer(provider),
      new SpecMemoryAnalyzer(provider),
    ];
    const ordered: string[] = topoSortByDependsOn(analyzers).map((a) => a.id);
    const driftIdx = ordered.indexOf('DriftMemoryAnalyzer');
    const embedIdx = ordered.indexOf('EmbeddingBackfillAnalyzer');
    for (const contentId of [
      'ConversationMemoryAnalyzer',
      'CodeMemoryAnalyzer',
      'BugHistoryMemoryAnalyzer',
      'ReviewFindingMemoryAnalyzer',
      'SpecMemoryAnalyzer',
    ]) {
      expect(ordered.indexOf(contentId)).toBeLessThan(driftIdx);
    }
    expect(driftIdx).toBeLessThan(embedIdx);
    expect(embedIdx).toBe(ordered.length - 1);
  });
});
