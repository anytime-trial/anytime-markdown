import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { SessionImporter } from '../SessionImporter';

type ImportedFilesMap = ReturnType<TrailDatabase['getImportedFileMap']>;

function makeBus(): { bus: EventBusPublisher; events: AnalyzerEvent[] } {
  const events: AnalyzerEvent[] = [];
  return { events, bus: { publish: async (e) => { events.push(e); } } };
}

function makeCtx(bus: EventBusPublisher): AnalyzerContext {
  return {
    runId: 'r1',
    reason: 'manual',
    logger: { info: () => undefined, error: () => undefined },
    bus,
  };
}

interface FakeDbState {
  importedMap: ImportedFilesMap;
  importSessionCalls: Array<{ filePath: string; repoName: string; isSubagent: boolean; externalTransaction: boolean }>;
  importSessionImpl: (filePath: string, repoName: string, isSubagent: boolean) => number;
  transactionLog: string[];
}

function makeFakeTrailDb(state: FakeDbState): TrailDatabase {
  return {
    getImportedFileMap: () => state.importedMap,
    importSession: (
      filePath: string,
      repoName: string,
      isSubagent = false,
      externalTransaction = false,
    ) => {
      state.importSessionCalls.push({ filePath, repoName, isSubagent, externalTransaction });
      return state.importSessionImpl(filePath, repoName, isSubagent);
    },
    beginExternalTransaction: () => { state.transactionLog.push('BEGIN'); },
    commitExternalTransaction: () => { state.transactionLog.push('COMMIT'); },
    rollbackExternalTransaction: () => { state.transactionLog.push('ROLLBACK'); },
  } as unknown as TrailDatabase;
}

function discoveredEvent(overrides: Partial<{
  sessionId: string;
  mainFile: string;
  subagentFiles: readonly string[];
  repoName: string;
  source: 'claude_code' | 'codex';
  fileSize: number;
  hasMessages: boolean;
  hasUsableCostData: boolean;
}> = {}): AnalyzerEvent {
  return {
    kind: 'jsonl_session_discovered',
    sessionId: 's1',
    mainFile: '/tmp/s1.jsonl',
    subagentFiles: [],
    repoName: 'r',
    source: 'claude_code',
    fileSize: 100,
    hasMessages: false,
    hasUsableCostData: false,
    ...overrides,
  };
}

function makeFakeState(): FakeDbState {
  return {
    importedMap: new Map(),
    importSessionCalls: [],
    importSessionImpl: () => 1,
    transactionLog: [],
  };
}

describe('SessionImporter', () => {
  it('imports newly discovered sessions and emits session_imported', async () => {
    const state = makeFakeState();
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 's1', mainFile: '/tmp/s1.jsonl' }), ctx);
    await importer.onRunEnd(ctx);

    expect(state.importSessionCalls).toHaveLength(1);
    expect(state.importSessionCalls[0]).toEqual({
      filePath: '/tmp/s1.jsonl', repoName: 'r', isSubagent: false, externalTransaction: true,
    });
    expect(state.transactionLog).toEqual(['BEGIN', 'COMMIT']);
    const imported = events.filter((e) => e.kind === 'session_imported');
    expect(imported).toHaveLength(1);
    if (imported[0].kind === 'session_imported') {
      expect(imported[0].sessionId).toBe('s1');
      expect(imported[0].messageCount).toBe(1);
      expect(imported[0].repoName).toBe('r');
    }
    expect(importer.getCounters()).toEqual({ imported: 1, skipped: 0 });
    expect([...importer.getSessionsToAnalyze()]).toEqual(['s1']);
  });

  it('skips when existing file has messages + usable cost data + unchanged size', async () => {
    const state = makeFakeState();
    state.importedMap.set('/tmp/s2.jsonl', {
      sessionId: 's2', fileSize: 999_999, commitsResolved: false, hasMessages: true, hasUsableCostData: true,
    });
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    // 実 fs.statSync が呼ばれるが、ファイルは存在しない → エラーパス
    await importer.onRunStart(ctx);
    await importer.onEvent(
      discoveredEvent({ sessionId: 's2', mainFile: '/tmp/s2.jsonl', hasMessages: true, hasUsableCostData: true }),
      ctx,
    );
    await importer.onRunEnd(ctx);

    // ファイル statSync 失敗 → session_skipped (file_unchanged) emit、importSession は呼ばれない
    expect(state.importSessionCalls).toHaveLength(0);
    const skipped = events.filter((e) => e.kind === 'session_skipped');
    expect(skipped).toHaveLength(1);
    if (skipped[0].kind === 'session_skipped') {
      expect(skipped[0].sessionId).toBe('s2');
      expect(skipped[0].reason).toBe('file_unchanged');
    }
  });

  it('imports both main + subagent files in a session', async () => {
    const state = makeFakeState();
    state.importSessionImpl = (_p, _r, isSubagent) => (isSubagent ? 3 : 5);
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      discoveredEvent({
        sessionId: 's3',
        mainFile: '/tmp/s3.jsonl',
        subagentFiles: ['/tmp/s3-agent-1.jsonl', '/tmp/s3-agent-2.jsonl'],
      }),
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(state.importSessionCalls).toHaveLength(3);
    expect(state.importSessionCalls.map((c) => c.isSubagent)).toEqual([false, true, true]);
    const imported = events.filter((e) => e.kind === 'session_imported');
    expect(imported).toHaveLength(1);
    if (imported[0].kind === 'session_imported') {
      expect(imported[0].messageCount).toBe(5 + 3 + 3);
    }
    expect(importer.getCounters().imported).toBe(3);
  });

  it('continues run on importSession failure (logs error, no throw)', async () => {
    const state = makeFakeState();
    state.importSessionImpl = (filePath) => {
      if (filePath.includes('bad')) throw new Error('parse error');
      return 1;
    };
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      discoveredEvent({ sessionId: 'sok', mainFile: '/tmp/good.jsonl' }),
      ctx,
    );
    await importer.onEvent(
      discoveredEvent({ sessionId: 'sbad', mainFile: '/tmp/bad.jsonl' }),
      ctx,
    );
    await importer.onRunEnd(ctx);

    // bad はカウントに含まれない (importSession throw)
    expect(importer.getCounters().imported).toBe(1);
    expect([...importer.getSessionsToAnalyze()]).toEqual(['sok', 'sbad']); // sessionsToAnalyze は add 後に throw
  });

  it('starts transaction once and commits on onRunEnd', async () => {
    const state = makeFakeState();
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'a' }), ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'b', mainFile: '/tmp/b.jsonl' }), ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'c', mainFile: '/tmp/c.jsonl' }), ctx);
    await importer.onRunEnd(ctx);

    expect(state.transactionLog).toEqual(['BEGIN', 'COMMIT']);
    expect(importer.getCounters().imported).toBe(3);
  });

  it('exposes tier=2 and proper subscribes/emits', () => {
    const state = makeFakeState();
    const importer = new SessionImporter({ trailDb: makeFakeTrailDb(state) });
    expect(importer.tier).toBe(2);
    expect(importer.id).toBe('SessionImporter');
    expect(importer.subscribes).toEqual(['jsonl_session_discovered']);
    expect(importer.emits).toEqual(['session_imported', 'session_skipped']);
  });

  it('onPhase fires import_sessions start/finish', async () => {
    const state = makeFakeState();
    const trailDb = makeFakeTrailDb(state);
    const phaseEvents: string[] = [];
    const importer = new SessionImporter({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent(), ctx);
    await importer.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['import_sessions:start', 'import_sessions:finish']);
  });

  it('resets state on subsequent onRunStart calls', async () => {
    const state = makeFakeState();
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'a' }), ctx);
    await importer.onRunEnd(ctx);
    expect(importer.getCounters().imported).toBe(1);

    await importer.onRunStart(ctx);
    expect(importer.getCounters().imported).toBe(0);
    expect(importer.getSessionsToAnalyze().size).toBe(0);
  });

  it('skips when statSync succeeds but file size is unchanged (not grown)', async () => {
    const state = makeFakeState();
    // ファイルが存在し、既存サイズと同じ（縮小・同一）→ skip
    const existingSize = 500;
    state.importedMap.set('/tmp/same-size.jsonl', {
      sessionId: 'ss1',
      fileSize: existingSize,
      commitsResolved: false,
      hasMessages: true,
      hasUsableCostData: true,
    });
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    // statSync が実際のファイルを読もうとするため、実在するファイルを使う
    // /proc/version は Linux で必ず存在する小さなファイル
    const realFile = '/proc/version';
    const realSize = require('node:fs').statSync(realFile).size;
    // fileSize を実ファイルサイズより大きくすることで「縮小」状態を作る
    state.importedMap.set(realFile, {
      sessionId: 'ss1',
      fileSize: realSize + 100_000,
      commitsResolved: false,
      hasMessages: true,
      hasUsableCostData: true,
    });

    await importer.onRunStart(ctx);
    await importer.onEvent(
      discoveredEvent({ sessionId: 'ss1', mainFile: realFile, hasMessages: true, hasUsableCostData: true }),
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(state.importSessionCalls).toHaveLength(0);
    const skipped = events.filter((e) => e.kind === 'session_skipped');
    expect(skipped).toHaveLength(1);
    if (skipped[0].kind === 'session_skipped') {
      expect(skipped[0].reason).toBe('file_unchanged');
    }
    expect(importer.getCounters().skipped).toBeGreaterThan(0);
  });

  it('commits mid-batch when BATCH_MESSAGE_LIMIT is exceeded (20000 messages)', async () => {
    const state = makeFakeState();
    // importSession が 20_001 messages を返すと、次の onEvent でバッチ上限に達する
    state.importSessionImpl = () => 20_001;
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'big' }), ctx);
    // mid-batch COMMIT が発生した後、onRunEnd で再度 COMMIT しようとするが
    // inTransaction=false なので onRunEnd の commit は呼ばれない
    await importer.onRunEnd(ctx);

    // BEGIN が 1 回、mid-batch COMMIT が 1 回（onRunEnd は inTransaction=false なのでスキップ）
    expect(state.transactionLog).toEqual(['BEGIN', 'COMMIT']);
  });

  it('ignores non-jsonl_session_discovered events silently', async () => {
    const state = makeFakeState();
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    // session_imported はこの analyzer の subscribes 外なので無視される
    await importer.onEvent(
      { kind: 'session_imported', sessionId: 'x', messageCount: 1, repoName: 'r' } as unknown as import('@anytime-markdown/memory-core').AnalyzerEvent,
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(state.importSessionCalls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('handles non-Error thrown by importSession via String(err) fallback', async () => {
    const state = makeFakeState();
    state.importSessionImpl = () => { throw 'non-error-string'; };
    const trailDb = makeFakeTrailDb(state);
    const importer = new SessionImporter({ trailDb });
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg: string) => { errors.push(msg); } },
      bus: { publish: async () => undefined },
    };

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 's1' }), ctx);
    await importer.onRunEnd(ctx);

    expect(errors.some((e) => e.includes('non-error-string'))).toBe(true);
  });

  it('rollbacks when COMMIT throws, and logs if ROLLBACK also throws', async () => {
    const state = makeFakeState();
    const trailDb: TrailDatabase = {
      getImportedFileMap: () => state.importedMap,
      importSession: () => 1,
      beginExternalTransaction: () => { state.transactionLog.push('BEGIN'); },
      commitExternalTransaction: () => {
        state.transactionLog.push('COMMIT_FAIL');
        throw new Error('disk full');
      },
      rollbackExternalTransaction: () => {
        state.transactionLog.push('ROLLBACK_FAIL');
        throw new Error('rollback also failed');
      },
    } as unknown as TrailDatabase;

    const importer = new SessionImporter({ trailDb });
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: {
        info: () => undefined,
        error: (msg: string) => { errors.push(msg); },
      },
      bus: { publish: async () => undefined },
    };

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'x' }), ctx);
    await importer.onRunEnd(ctx);

    expect(state.transactionLog).toContain('BEGIN');
    expect(state.transactionLog).toContain('COMMIT_FAIL');
    expect(state.transactionLog).toContain('ROLLBACK_FAIL');
    // COMMIT と ROLLBACK 両方の失敗がログに出る
    expect(errors.some((e) => e.includes('COMMIT failed'))).toBe(true);
    expect(errors.some((e) => e.includes('ROLLBACK also failed'))).toBe(true);
  });

  it('handles non-Error objects thrown by COMMIT and ROLLBACK via String() fallback', async () => {
    const state = makeFakeState();
    const trailDb: TrailDatabase = {
      getImportedFileMap: () => state.importedMap,
      importSession: () => 1,
      beginExternalTransaction: () => { state.transactionLog.push('BEGIN'); },
      commitExternalTransaction: () => {
        state.transactionLog.push('COMMIT_FAIL');
        throw 'non-error-commit';
      },
      rollbackExternalTransaction: () => {
        state.transactionLog.push('ROLLBACK_FAIL');
        throw 'non-error-rollback';
      },
    } as unknown as TrailDatabase;

    const importer = new SessionImporter({ trailDb });
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: {
        info: () => undefined,
        error: (msg: string) => { errors.push(msg); },
      },
      bus: { publish: async () => undefined },
    };

    await importer.onRunStart(ctx);
    await importer.onEvent(discoveredEvent({ sessionId: 'y' }), ctx);
    await importer.onRunEnd(ctx);

    expect(errors.some((e) => e.includes('non-error-commit'))).toBe(true);
    expect(errors.some((e) => e.includes('non-error-rollback'))).toBe(true);
  });
});
