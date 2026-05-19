import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryCoreService, type MemoryDbSession, type ScopeResult } from '@anytime-markdown/memory-core';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

function ok(scope: string): ScopeResult {
  return { scope, status: 'ok', itemsProcessed: 0, itemsFailed: 0 };
}

interface FakeSession {
  calls: string[];
  closed: number;
  session: MemoryDbSession;
}

function makeFakeSession(
  overrides: Partial<Record<keyof MemoryDbSession, () => Promise<ScopeResult>>> = {},
): FakeSession {
  const state: FakeSession = { calls: [], closed: 0, session: null as unknown as MemoryDbSession };
  state.session = {
    runConversation: async () => (state.calls.push('conversation'), ok('conversation_incremental')),
    runCode: async () => (state.calls.push('code'), ok('code_incremental')),
    runBugHistory: async () => (state.calls.push('bugHistory'), ok('bug_history_incremental')),
    runReview: async () => (state.calls.push('review'), ok('review_incremental')),
    runSpec: async () => (state.calls.push('spec'), ok('spec_incremental')),
    runDrift: async () => (state.calls.push('drift'), ok('drift_detection')),
    runEmbeddingBackfill: async () => (state.calls.push('embedding'), ok('embedding_backfill')),
    close: () => {
      state.closed += 1;
    },
    ...overrides,
  } as unknown as MemoryDbSession;
  return state;
}

/** openScopeSession を fake session に差し替えた MemoryCoreService。 */
function makeMemoryCore(dir: string, fake: FakeSession): MemoryCoreService {
  const mc = new MemoryCoreService({
    logSink: makeLogSink(),
    trailDbPath: join(dir, 'trail.db'),
    dbPath: join(dir, 'memory-core.db'),
    statePath: join(dir, 'memory-core-runner.json'),
    pipelineRunner: async () => undefined,
  });
  (mc as unknown as { openScopeSession: () => Promise<MemoryDbSession> }).openScopeSession =
    async () => fake.session;
  return mc;
}

describe('AnalyzeAllRunner — useMemoryAnalyzers (LEP Step 3b)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-mem-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs all 7 memory scopes in dependsOn order via Wave 3, then closes the session once', async () => {
    const fake = makeFakeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      memoryCoreService: makeMemoryCore(dir, fake),
      useMemoryAnalyzers: true,
    });

    const status = await runner.runOnce('manual');

    expect(status.lastError).toBeNull();
    expect(fake.calls).toEqual([
      'conversation',
      'code',
      'bugHistory',
      'review',
      'spec',
      'drift',
      'embedding',
    ]);
    expect(fake.closed).toBe(1);
  });

  it('surfaces a scope error as lastError and still closes the session', async () => {
    const fake = makeFakeSession({
      runReview: async () => ({
        scope: 'review_incremental',
        status: 'error',
        itemsProcessed: 0,
        itemsFailed: 0,
        error: 'review boom',
      }),
    });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      memoryCoreService: makeMemoryCore(dir, fake),
      useMemoryAnalyzers: true,
    });

    const status = await runner.runOnce('manual');

    expect(status.lastError).toContain('review boom');
    expect(fake.closed).toBe(1);
    // 他 analyzer は独立なので review 失敗後も走る (LEP モデル)
    expect(fake.calls).toContain('drift');
  });

  it('legacy path (useMemoryAnalyzers=false) does not open a scope session', async () => {
    const fake = makeFakeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      memoryCoreService: makeMemoryCore(dir, fake),
      // useMemoryAnalyzers 省略 = legacy
    });

    const status = await runner.runOnce('manual');
    expect(status.lastError).toBeNull();
    expect(fake.calls).toEqual([]); // legacy は runOnce(pipelineRunner) を使う
    expect(fake.closed).toBe(0);
  });
});
