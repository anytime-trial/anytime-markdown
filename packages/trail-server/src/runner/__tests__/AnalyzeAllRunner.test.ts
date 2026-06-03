import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';
import { makeFakeScopeSession, makeMemoryCoreWithSession } from './fakeMemoryScopeSession';

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

/**
 * Step 3d: Layer 3 は 7 個の memory analyzer が openScopeSession() の scope メソッドを呼ぶ。
 * 実 DB を開かずに fake scope session を注入して検証する。trail.db 取込 (Wave 1/2) は
 * LEP primary analyzer + PersistAnalyzer(save) が担う。
 */
function makeFakeTrailDb(save: jest.Mock = jest.fn()): TrailDatabase {
  return {
    save,
    getImportedFileMap: () => new Map(),
    isCommitResolutionDone: () => true,
    beginExternalTransaction: () => undefined,
    commitExternalTransaction: () => undefined,
    rollbackExternalTransaction: () => undefined,
    rebuildSessionCostsPublic: () => undefined,
    rebuildDailyCountsPublic: () => undefined,
    rebuildSessionStatsPublic: () => undefined,
    runBehaviorAnalysis: () => undefined,
    analyzeReleases: () => 0,
    backfillCommitFilesPublic: () => undefined,
    backfillSubagentTypePublic: () => undefined,
    backfillMessageCommits: () => 0,
  } as unknown as TrailDatabase;
}

describe('AnalyzeAllRunner', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-runner-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runOnce persists trail.db (save) before memory scopes', async () => {
    const order: string[] = [];
    const save = jest.fn(() => { order.push('save'); });
    const fake = makeFakeScopeSession({ order, orderLabel: 'memory' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');
    // save() は Wave 2 末 (PersistAnalyzer)、memory は Wave 3。save が先。
    expect(order).toEqual(['save', 'memory']);
    expect(save).toHaveBeenCalledTimes(1);
    expect(fake.calls.length).toBe(7);
    expect(fake.closed).toBe(1);
    expect(status.ticksRun).toBe(1);
    expect(status.lastError).toBeNull();
    expect(status.lastReason).toBe('manual');
  });

  it('runOnce without trailDb runs only memory', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');
    expect(fake.calls.length).toBe(7);
    expect(status.ticksRun).toBe(1);
  });

  it('pause skips automatic reasons (startup/periodic) and increments ticksSkipped', async () => {
    const save = jest.fn();
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    await runner.pause('cli');
    const s1 = await runner.runOnce('startup');
    expect(s1.ticksSkipped).toBe(1);
    expect(save).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);

    await runner.runOnce('periodic');
    expect(runner.getStatus().ticksSkipped).toBe(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('pause does NOT skip user-initiated reasons (manual/import)', async () => {
    const save = jest.fn();
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    await runner.pause('cli');
    await runner.runOnce('manual');
    expect(save).toHaveBeenCalledTimes(1);
    expect(fake.calls.length).toBe(7);

    await runner.runOnce('import');
    expect(save).toHaveBeenCalledTimes(2);
    expect(fake.calls.length).toBe(14);
    expect(runner.getStatus().ticksRun).toBe(2);
  });

  it('records lastError when trail.db save throws (memory still runs)', async () => {
    const save = jest.fn(() => { throw new Error('save boom'); });
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');
    expect(fake.calls.length).toBe(7); // memory も走る (Wave 3 は save 失敗と独立)
    expect(status.lastError).toContain('save boom');
    expect(status.ticksRun).toBe(0);
  });

  it('records lastError when a memory scope throws (save still ran)', async () => {
    const save = jest.fn();
    const fake = makeFakeScopeSession({ errorOnScope: 'runConversation', errorMessage: 'mem boom' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');
    expect(save).toHaveBeenCalledTimes(1);
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('records combined lastError when both save and a memory scope fail', async () => {
    const save = jest.fn(() => { throw new Error('save boom'); });
    const fake = makeFakeScopeSession({ errorOnScope: 'runDrift', errorMessage: 'mem boom' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');
    expect(status.lastError).toContain('importAll: save boom');
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('persists state across instantiation', async () => {
    const statePath = join(dir, 'analyze-all-runner.json');
    const fake = makeFakeScopeSession();
    const memoryCore = makeMemoryCoreWithSession(dir, fake.session);
    const r1 = new AnalyzeAllRunner({ logSink: makeLogSink(), statePath, memoryCoreService: memoryCore });
    await r1.pause('cli');
    await r1.runOnce('manual');
    await r1.dispose();

    const r2 = new AnalyzeAllRunner({ logSink: makeLogSink(), statePath, memoryCoreService: memoryCore });
    const s = r2.getStatus();
    expect(s.paused).toBe(true);
    expect(s.pausedBy).toBe('cli');
    expect(s.ticksRun).toBe(1);
    await r2.dispose();
  });

  it('start schedules startup tick with runOnStart=true', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    runner.start(60_000, { runOnStart: true, startupDelayMs: 10 });
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(fake.calls.length).toBe(7);
    await runner.dispose();
  });

  it('onImportProgress / onImportPhase / onAfterRun callbacks fire', async () => {
    const progressMsgs: string[] = [];
    const phaseEvents: string[] = [];
    let afterRunCalled = 0;
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      onImportProgress: (m) => progressMsgs.push(m),
      onImportPhase: (e) => phaseEvents.push(e.phase),
      onAfterRun: () => {
        afterRunCalled++;
      },
    });

    await runner.runOnce('manual');
    expect(phaseEvents).toContain('import_sessions');
    expect(phaseEvents).toContain('resolve_releases');
    expect(phaseEvents).toContain('import_coverage');
    expect(phaseEvents).toContain('rebuild_costs');
    expect(phaseEvents).toContain('rebuild_counts');
    expect(afterRunCalled).toBe(1);
  });

  it('runs without memoryCoreService (useExternalDaemon mode)', async () => {
    const save = jest.fn();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      // memoryCoreService omitted
    });
    const status = await runner.runOnce('manual');
    expect(save).toHaveBeenCalledTimes(1);
    expect(status.ticksRun).toBe(1);
    expect(status.lastError).toBeNull();
  });

  it('AnalyzeAllRunner pause is the only gate (memory-core internal pause is irrelevant)', async () => {
    // Step 3d: memory analyzer は openScopeSession を直接呼ぶため memory-core の
    // 内部 pause を参照しない。AnalyzeAllRunner 自身の pause のみが実行を制御する。
    const fake = makeFakeScopeSession();
    const memoryCore = makeMemoryCoreWithSession(dir, fake.session);
    await memoryCore.pause('internal-test'); // 影響しないことを確認
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: memoryCore,
    });
    expect(runner.getStatus().paused).toBe(false);
    const status = await runner.runOnce('periodic');
    expect(fake.calls.length).toBe(7); // memory-core pause に関係なく走る
    expect(status.ticksRun).toBe(1);
    expect(status.lastError).toBeNull();
  });
});

describe('AnalyzeAllRunner — disabledPrimaryAnalyzers (Layer 2 toggle)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-toggle-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const TOGGLEABLE = [
    'ReleaseResolver',
    'CoverageImporter',
    'BehaviorAnalyzer',
    'CommitFilesBackfiller',
    'SubagentTypeBackfiller',
    'MessageCommitMatcher',
  ];

  it('既定では全 toggle 可能 Layer 2 analyzer を登録する', () => {
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 's.json'),
      trailDb: makeFakeTrailDb(),
    });
    const ids = runner.getActiveAnalyzerIds();
    for (const id of TOGGLEABLE) expect(ids).toContain(id);
  });

  it('disabled 指定の Layer 2 analyzer を登録しない (他は維持)', () => {
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 's.json'),
      trailDb: makeFakeTrailDb(),
      disabledPrimaryAnalyzers: ['ReleaseResolver', 'CoverageImporter', 'MessageCommitMatcher'],
    });
    const ids = runner.getActiveAnalyzerIds();
    expect(ids).not.toContain('ReleaseResolver');
    expect(ids).not.toContain('CoverageImporter');
    expect(ids).not.toContain('MessageCommitMatcher');
    // 無効化していない toggle 可能 analyzer は残る
    expect(ids).toContain('BehaviorAnalyzer');
    expect(ids).toContain('CommitFilesBackfiller');
    expect(ids).toContain('SubagentTypeBackfiller');
  });

  it('核 analyzer は disabled に含めても常時登録される', () => {
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 's.json'),
      trailDb: makeFakeTrailDb(),
      // 核 id を渡しても無視される
      disabledPrimaryAnalyzers: ['SessionImporter', 'CommitResolver', 'Persist', 'CodeGraphBuilder'],
    });
    const ids = runner.getActiveAnalyzerIds();
    expect(ids).toContain('SessionImporter');
    expect(ids).toContain('CommitResolver');
    expect(ids).toContain('Persist'); // PersistAnalyzer.id === 'Persist'
    expect(ids).toContain('CodeGraphBuilder');
  });
});
