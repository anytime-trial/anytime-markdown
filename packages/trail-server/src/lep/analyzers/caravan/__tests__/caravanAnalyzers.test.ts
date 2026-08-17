import type {
  AnalyzerContext,
  AnalyzerEvent,
  CaravanBookService,
  CaravanDbSession,
  ScopeResult,
} from '@anytime-markdown/trail-caravan-book';

import { topoSortByDependsOn } from '@anytime-markdown/trail-caravan-book';

import { BugHistoryCaravanAnalyzer } from '../BugHistoryCaravanAnalyzer';
import { CodeCaravanAnalyzer } from '../CodeCaravanAnalyzer';
import { ConversationCaravanAnalyzer } from '../ConversationCaravanAnalyzer';
import { DriftCaravanAnalyzer } from '../DriftCaravanAnalyzer';
import { EmbeddingBackfillAnalyzer } from '../EmbeddingBackfillAnalyzer';
import { CaravanWaveSessionProvider } from '../CaravanWaveSessionProvider';
import { ReviewFindingCaravanAnalyzer } from '../ReviewFindingCaravanAnalyzer';
import { SpecCaravanAnalyzer } from '../SpecCaravanAnalyzer';
import { CaravanAnalyzerBase } from '../CaravanAnalyzerBase';
import { createCaravanAnalyzers } from '../index';

function ok(scope: string): ScopeResult {
  return { scope, status: 'ok', itemsProcessed: 0, itemsFailed: 0 };
}

/** 7 scope メソッドの呼び出しを記録する fake session。 */
function makeFakeSession(overrides: Partial<Record<keyof CaravanDbSession, () => Promise<ScopeResult>>> = {}) {
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
  } as unknown as CaravanDbSession;
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

const primaryEvent: AnalyzerEvent = { kind: 'wave_start', wave: 'memory' };

describe('memory analyzers', () => {
  it('each analyzer calls its own scope method on wave_complete:primary', async () => {
    const { session, calls } = makeFakeSession();
    const provider = new CaravanWaveSessionProvider(async () => session);
    const ctx = makeCtx();

    await new ConversationCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new CodeCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new BugHistoryCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new ReviewFindingCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new SpecCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new DriftCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new EmbeddingBackfillAnalyzer(provider).onEvent(primaryEvent, ctx);

    expect(calls).toEqual(['conversation', 'code', 'bugHistory', 'review', 'spec', 'drift', 'embedding']);
  });

  it('ConversationCaravanAnalyzer は provider.throttleGate を runConversation の shouldStop に渡す', async () => {
    const gate = () => true;
    let received: (() => boolean) | undefined;
    const { session } = makeFakeSession({
      runConversation: (async (opts?: { shouldStop?: () => boolean }) => {
        received = opts?.shouldStop;
        return ok('conversation_incremental');
      }) as unknown as () => Promise<ScopeResult>,
    });
    const provider = new CaravanWaveSessionProvider(async () => session, undefined, undefined, gate);

    await new ConversationCaravanAnalyzer(provider).onEvent(primaryEvent, makeCtx());

    expect(received).toBe(gate);
  });

  it('createCaravanAnalyzers が throttleGate を provider へ伝播する', () => {
    const gate = () => true;
    const fakeService = { openScopeSession: async () => null } as unknown as CaravanBookService;
    const { provider } = createCaravanAnalyzers(fakeService, { throttleGate: gate });
    expect(provider.throttleGate).toBe(gate);
  });

  it('only acts on wave_start:memory (ignores other waves/events)', async () => {
    const { session, calls } = makeFakeSession();
    const provider = new CaravanWaveSessionProvider(async () => session);
    const ctx = makeCtx();
    const a = new ConversationCaravanAnalyzer(provider);

    await a.onEvent({ kind: 'wave_start', wave: 'sources' }, ctx);
    await a.onEvent({ kind: 'wave_start', wave: 'primary' }, ctx);
    await a.onEvent({ kind: 'wave_complete', wave: 'primary' }, ctx);
    await a.onEvent({ kind: 'session_imported', sessionId: 's', messageCount: 1, repoName: 'r' }, ctx);
    expect(calls).toEqual([]);
  });

  it('throws when scope result status is error', async () => {
    const { session } = makeFakeSession({
      runDrift: async () => ({ scope: 'drift_detection', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: 'boom' }),
    });
    const provider = new CaravanWaveSessionProvider(async () => session);
    await expect(new DriftCaravanAnalyzer(provider).onEvent(primaryEvent, makeCtx())).rejects.toThrow('boom');
  });

  it('throws with generic message when scope status is error but error field is absent', async () => {
    const { session } = makeFakeSession({
      runCode: async () => ({ scope: 'code_incremental', status: 'error', itemsProcessed: 0, itemsFailed: 0 }),
    });
    const provider = new CaravanWaveSessionProvider(async () => session);
    // error フィールドが undefined → `${id} failed` にフォールバック
    await expect(new CodeCaravanAnalyzer(provider).onEvent(primaryEvent, makeCtx())).rejects.toThrow('CodeCaravanAnalyzer failed');
  });

  it('skips silently when session factory returns null (activity.db missing)', async () => {
    const provider = new CaravanWaveSessionProvider(async () => null);
    await expect(new CodeCaravanAnalyzer(provider).onEvent(primaryEvent, makeCtx())).resolves.toBeUndefined();
  });

  it('all analyzers share one session (factory called once)', async () => {
    const { session } = makeFakeSession();
    let factoryCalls = 0;
    const provider = new CaravanWaveSessionProvider(async () => {
      factoryCalls++;
      return session;
    });
    const ctx = makeCtx();
    const analyzers: CaravanAnalyzerBase[] = [
      new ConversationCaravanAnalyzer(provider),
      new CodeCaravanAnalyzer(provider),
      new DriftCaravanAnalyzer(provider),
    ];
    for (const a of analyzers) await a.onEvent(primaryEvent, ctx);
    expect(factoryCalls).toBe(1);
  });

  it('provider.closeIfOpen closes the session exactly once', () => {
    const { session, isClosed } = makeFakeSession();
    const provider = new CaravanWaveSessionProvider(async () => session);
    return provider.ensure().then(() => {
      expect(provider.isOpen).toBe(true);
      provider.closeIfOpen();
      expect(isClosed()).toBe(true);
      expect(provider.isOpen).toBe(false);
      provider.closeIfOpen(); // 2 回目は no-op
    });
  });

  it('LLM 可用性は run ごとに測り直す（closeIfOpen 後に再チェックされる）', async () => {
    // provider は AnalyzeAllRunner のコンストラクタで 1 度だけ作られ daemon の生存期間
    // ずっと使われる。可用性を provider の生存期間キャッシュにすると、daemon 起動時に
    // Ollama が落ちていた場合、その後 Ollama を起動しても daemon を再起動するまで
    // LLM 依存スコープが永久に skip され続ける（実測: 2026-08-17 に 6 日分の会話取込が
    // 停止）。CaravanAnalyzerBase の「Ollama 復旧後の次 run で取りこぼしを回収する」
    // という宣言を満たすには、run 境界（closeIfOpen）で測り直す必要がある。
    const { session } = makeFakeSession();
    let checkerCalls = 0;
    let reachable = false;
    const checker = async () => {
      checkerCalls += 1;
      return {
        ollama_chat: { ok: reachable },
        ollama_embedding: { ok: reachable },
      };
    };
    const provider = new CaravanWaveSessionProvider(async () => session, checker, 'http://x:11434');

    // run 1: Ollama 停止中
    expect((await provider.getAvailability())?.ollama_chat.ok).toBe(false);
    // 同一 run 内は 1 回だけ測る（7 analyzer が順に呼ぶため）
    expect((await provider.getAvailability())?.ollama_chat.ok).toBe(false);
    expect(checkerCalls).toBe(1);
    await provider.ensure();
    provider.closeIfOpen();

    // run 2: Ollama 復旧後
    reachable = true;
    expect((await provider.getAvailability())?.ollama_chat.ok).toBe(true);
    expect(checkerCalls).toBe(2);
  });

  it('LLM-dependent analyzers skip when embedding unavailable; LLM-free analyzers run', async () => {
    const { session, calls } = makeFakeSession();
    const checker = async () => ({ ollama_chat: { ok: true }, ollama_embedding: { ok: false, detail: 'not pulled' } });
    const provider = new CaravanWaveSessionProvider(async () => session, checker, 'http://localhost:11434');
    const ctx = makeCtx();

    // chat+embedding 依存 → skip
    await new ConversationCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new ReviewFindingCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new SpecCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    // embedding-only 依存 → skip
    await new EmbeddingBackfillAnalyzer(provider).onEvent(primaryEvent, ctx);
    // LLM 非依存 → 実行
    await new CodeCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new BugHistoryCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new DriftCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);

    expect(calls).toEqual(['code', 'bugHistory', 'drift']);
  });

  it('Ollama completely unavailable: only Code/BugHistory/Drift run', async () => {
    const { session, calls } = makeFakeSession();
    const checker = async () => ({
      ollama_chat: { ok: false, detail: 'ECONNREFUSED' },
      ollama_embedding: { ok: false, detail: 'ECONNREFUSED' },
    });
    const provider = new CaravanWaveSessionProvider(async () => session, checker);
    const ctx = makeCtx();
    for (const A of [
      ConversationCaravanAnalyzer,
      CodeCaravanAnalyzer,
      BugHistoryCaravanAnalyzer,
      ReviewFindingCaravanAnalyzer,
      SpecCaravanAnalyzer,
      DriftCaravanAnalyzer,
      EmbeddingBackfillAnalyzer,
    ]) {
      await new A(provider).onEvent(primaryEvent, ctx);
    }
    expect(calls).toEqual(['code', 'bugHistory', 'drift']);
  });

  it('emits wave_skipped when an LLM analyzer is skipped (cursor protected — scope not run)', async () => {
    const { session, calls } = makeFakeSession();
    const checker = async () => ({ ollama_chat: { ok: false }, ollama_embedding: { ok: false } });
    const provider = new CaravanWaveSessionProvider(async () => session, checker);
    const published: AnalyzerEvent[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r',
      reason: 'manual',
      logger: { info: () => {}, error: () => {} },
      bus: { publish: async (e) => void published.push(e) },
    };
    await new ConversationCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    expect(calls).toEqual([]); // scope 未実行 = cursor 保護
    expect(published.some((e) => e.kind === 'wave_skipped')).toBe(true);
  });

  it('no LLM gating when availability checker is absent (all run)', async () => {
    const { session, calls } = makeFakeSession();
    const provider = new CaravanWaveSessionProvider(async () => session); // checker 省略
    const ctx = makeCtx();
    await new ConversationCaravanAnalyzer(provider).onEvent(primaryEvent, ctx);
    await new EmbeddingBackfillAnalyzer(provider).onEvent(primaryEvent, ctx);
    expect(calls).toEqual(['conversation', 'embedding']);
  });

  it('tier and subscribes are correct (tier 3, wave_start)', () => {
    const provider = new CaravanWaveSessionProvider(async () => null);
    const a = new ConversationCaravanAnalyzer(provider);
    expect(a.tier).toBe(3);
    expect(a.subscribes).toEqual(['wave_start']);
  });

  it('dependsOn ordering: Drift after content, EmbeddingBackfill last', () => {
    const provider = new CaravanWaveSessionProvider(async () => null);
    const analyzers = [
      new EmbeddingBackfillAnalyzer(provider),
      new DriftCaravanAnalyzer(provider),
      new ConversationCaravanAnalyzer(provider),
      new CodeCaravanAnalyzer(provider),
      new BugHistoryCaravanAnalyzer(provider),
      new ReviewFindingCaravanAnalyzer(provider),
      new SpecCaravanAnalyzer(provider),
    ];
    const ordered: string[] = topoSortByDependsOn(analyzers).map((a) => a.id);
    const driftIdx = ordered.indexOf('DriftCaravanAnalyzer');
    const embedIdx = ordered.indexOf('EmbeddingBackfillAnalyzer');
    for (const contentId of [
      'ConversationCaravanAnalyzer',
      'CodeCaravanAnalyzer',
      'BugHistoryCaravanAnalyzer',
      'ReviewFindingCaravanAnalyzer',
      'SpecCaravanAnalyzer',
    ]) {
      expect(ordered.indexOf(contentId)).toBeLessThan(driftIdx);
    }
    expect(driftIdx).toBeLessThan(embedIdx);
    expect(embedIdx).toBe(ordered.length - 1);
  });
});

describe('createCaravanAnalyzers', () => {
  function makeCaravanBookService(): CaravanBookService {
    return {
      openScopeSession: async () => null,
    } as unknown as CaravanBookService;
  }

  it('returns 7 analyzers and a provider by default', () => {
    const svc = makeCaravanBookService();
    const { analyzers, provider } = createCaravanAnalyzers(svc);
    expect(analyzers).toHaveLength(7);
    expect(provider).toBeInstanceOf(CaravanWaveSessionProvider);
  });

  it('filters out disabled analyzer ids', () => {
    const svc = makeCaravanBookService();
    const { analyzers } = createCaravanAnalyzers(svc, {
      disabledAnalyzerIds: ['ConversationCaravanAnalyzer', 'EmbeddingBackfillAnalyzer'],
    });
    expect(analyzers).toHaveLength(5);
    const ids = analyzers.map((a) => a.id);
    expect(ids).not.toContain('ConversationCaravanAnalyzer');
    expect(ids).not.toContain('EmbeddingBackfillAnalyzer');
  });

  it('passes ollamaBaseUrl and checkLlmAvailability to provider', () => {
    const svc = makeCaravanBookService();
    const checker = async () => ({ ollama_chat: { ok: true }, ollama_embedding: { ok: true } });
    const { provider } = createCaravanAnalyzers(svc, {
      checkLlmAvailability: checker,
      ollamaBaseUrl: 'http://host.docker.internal:11434',
    });
    expect(provider.ollamaBaseUrl).toBe('http://host.docker.internal:11434');
  });

  it('provider.ensure() delegates to caravanBookService.openScopeSession()', async () => {
    let called = false;
    const svc = {
      openScopeSession: async () => { called = true; return null; },
    } as unknown as CaravanBookService;
    const { provider } = createCaravanAnalyzers(svc);
    await provider.ensure();
    expect(called).toBe(true);
  });
});
