import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BaseRunner } from '../../src/runner/BaseRunner';
import type { RunReason, RunnerStatus } from '../../src/runner/types';

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface TestRunnerOpts {
  statePath: string;
  impl: (reason: RunReason) => Promise<void>;
  userInitiatedReasons?: ReadonlySet<RunReason>;
}

class TestRunner extends BaseRunner {
  public readonly calls: Array<{ reason: RunReason; startedAt: number }> = [];
  private readonly impl: (reason: RunReason) => Promise<void>;
  constructor(opts: TestRunnerOpts, logs: string[]) {
    super({
      logSink: { appendLine: (msg: string) => logs.push(msg) },
      logTag: 'test-runner',
      statePath: opts.statePath,
      userInitiatedReasons: opts.userInitiatedReasons,
    });
    this.impl = opts.impl;
  }
  protected override runImpl(reason: RunReason): Promise<void> {
    this.calls.push({ reason, startedAt: Date.now() });
    return this.impl(reason);
  }
}

describe('BaseRunner', () => {
  let dir: string;
  let logs: string[];
  let runner: TestRunner | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'base-runner-tests-'));
    logs = [];
    runner = null;
  });

  afterEach(async () => {
    if (runner) await runner.dispose();
    rmSync(dir, { recursive: true });
  });

  function makeRunner(
    impl: (reason: RunReason) => Promise<void> = async () => {},
    userInitiatedReasons?: ReadonlySet<RunReason>,
  ): TestRunner {
    runner = new TestRunner(
      { statePath: join(dir, 'state.json'), impl, userInitiatedReasons },
      logs,
    );
    return runner;
  }

  it('runOnce calls runImpl and records success metrics', async () => {
    const r = makeRunner();
    const s = await r.runOnce('manual');
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].reason).toBe('manual');
    expect(s.ticksRun).toBe(1);
    expect(s.ticksSkipped).toBe(0);
    expect(s.lastError).toBeNull();
    expect(s.lastReason).toBe('manual');
    expect(s.lastRunAt).not.toBeNull();
    expect(s.lastDurationMs).not.toBeNull();
    expect(s.running).toBe(false);
  });

  it('pause skips automatic reasons (startup/periodic) and increments ticksSkipped', async () => {
    const r = makeRunner();
    await r.pause('test');
    const s1 = await r.runOnce('startup');
    expect(s1.ticksSkipped).toBe(1);
    expect(s1.ticksRun).toBe(0);
    const s2 = await r.runOnce('periodic');
    expect(s2.ticksSkipped).toBe(2);
    expect(r.calls).toHaveLength(0);
  });

  it('pause does NOT skip user-initiated reasons (manual/import)', async () => {
    const r = makeRunner();
    await r.pause('test');
    await r.runOnce('manual');
    await r.runOnce('import');
    const s = r.getStatus();
    expect(s.ticksRun).toBe(2);
    expect(s.ticksSkipped).toBe(0);
    expect(r.calls.map((c) => c.reason)).toEqual(['manual', 'import']);
  });

  it('resume clears paused state', async () => {
    const r = makeRunner();
    await r.pause('cli');
    expect(r.getStatus().paused).toBe(true);
    await r.resume();
    const s = r.getStatus();
    expect(s.paused).toBe(false);
    expect(s.pausedAt).toBeNull();
    expect(s.pausedBy).toBeNull();
  });

  it('mutex serializes concurrent runOnce calls', async () => {
    let firstResolve!: () => void;
    let secondResolve!: () => void;
    const blockers = [
      new Promise<void>((resolve) => {
        firstResolve = resolve;
      }),
      new Promise<void>((resolve) => {
        secondResolve = resolve;
      }),
    ];
    let callIdx = 0;
    const r = makeRunner(async () => {
      const idx = callIdx++;
      await blockers[idx];
    });
    const firstP = r.runOnce('manual');
    await nextTick();
    expect(r.calls).toHaveLength(1);
    const secondP = r.runOnce('periodic');
    await nextTick();
    expect(r.calls).toHaveLength(1); // 2 つ目はまだ mutex 待ち
    firstResolve();
    await firstP;
    await nextTick();
    expect(r.calls).toHaveLength(2);
    secondResolve();
    await secondP;
  });

  it('catches runImpl exception and records lastError without throwing', async () => {
    const r = makeRunner(async () => {
      throw new Error('boom');
    });
    const s = await r.runOnce('manual');
    expect(s.lastError).toBe('boom');
    expect(s.ticksRun).toBe(0);
    expect(s.running).toBe(false);
  });

  it('clears lastError on subsequent success', async () => {
    let throwIt = true;
    const r = makeRunner(async () => {
      if (throwIt) throw new Error('first fail');
    });
    await r.runOnce('manual');
    expect(r.getStatus().lastError).toBe('first fail');
    throwIt = false;
    const s = await r.runOnce('manual');
    expect(s.lastError).toBeNull();
    expect(s.ticksRun).toBe(1);
  });

  it('persists state to file and is recoverable on next instantiation', async () => {
    const r1 = makeRunner();
    await r1.pause('cli');
    await r1.runOnce('manual');
    await r1.dispose();

    runner = null;
    const r2 = new TestRunner({ statePath: join(dir, 'state.json'), impl: async () => {} }, logs);
    const s = r2.getStatus();
    expect(s.paused).toBe(true);
    expect(s.pausedBy).toBe('cli');
    expect(s.ticksRun).toBe(1);
    await r2.dispose();
  });

  it('writes valid JSON to state file', async () => {
    const r = makeRunner();
    await r.runOnce('manual');
    const raw = readFileSync(join(dir, 'state.json'), 'utf-8');
    const parsed = JSON.parse(raw) as RunnerStatus;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.ticksRun).toBe(1);
  });

  it('start schedules startup timer with runOnStart=true', async () => {
    const r = makeRunner();
    r.start(60_000, { runOnStart: true, startupDelayMs: 10 });
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].reason).toBe('startup');
    r.stop();
  });

  it('start with runOnStart=false skips startup tick', async () => {
    const r = makeRunner();
    r.start(60_000, { runOnStart: false, startupDelayMs: 10 });
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(r.calls).toHaveLength(0);
    r.stop();
  });

  it('stop cancels pending startup timer', async () => {
    const r = makeRunner();
    r.start(60_000, { runOnStart: true, startupDelayMs: 50 });
    r.stop();
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    expect(r.calls).toHaveLength(0);
  });

  it('dispose waits for in-flight runOnce', async () => {
    let resolveImpl!: () => void;
    const r = makeRunner(
      () =>
        new Promise<void>((resolve) => {
          resolveImpl = resolve;
        }),
    );
    const runP = r.runOnce('manual');
    await nextTick();
    const disposeP = r.dispose();
    let disposed = false;
    void disposeP.then(() => {
      disposed = true;
    });
    await nextTick();
    expect(disposed).toBe(false);
    resolveImpl();
    await runP;
    await disposeP;
    expect(disposed).toBe(true);
  });

  it('customUserInitiatedReasons: startup is treated as user-initiated when configured', async () => {
    const r = makeRunner(async () => {}, new Set<RunReason>(['startup', 'manual', 'import']));
    await r.pause('test');
    // startup は userInitiatedReasons に含めたため、pause を無視して実行される
    await r.runOnce('startup');
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].reason).toBe('startup');
  });

  it('getStatus returns a shallow copy (does not share reference)', async () => {
    const r = makeRunner();
    const s1 = r.getStatus();
    const s2 = r.getStatus();
    expect(s1).toEqual(s2);
    expect(s1).not.toBe(s2); // 別参照
  });

  it('pause sets pausedAt to current ISO timestamp', async () => {
    const before = new Date().toISOString();
    const r = makeRunner();
    await r.pause('admin');
    const after = new Date().toISOString();
    const s = r.getStatus();
    expect(s.paused).toBe(true);
    expect(s.pausedBy).toBe('admin');
    // pausedAt が before <= pausedAt <= after
    expect(s.pausedAt).not.toBeNull();
    expect(s.pausedAt! >= before).toBe(true);
    expect(s.pausedAt! <= after).toBe(true);
  });

  it('start with intervalMs=0 does not set interval timer', async () => {
    const r = makeRunner();
    // intervalMs=0 → interval を作らない
    r.start(0, { runOnStart: false });
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(r.calls).toHaveLength(0);
    r.stop();
  });

  it('multiple start() calls clear the previous timer (idempotent)', async () => {
    const r = makeRunner();
    r.start(60_000, { runOnStart: true, startupDelayMs: 100 });
    // すぐに再 start → 前の startupTimer をキャンセルして新しいものを仕掛ける
    r.start(60_000, { runOnStart: true, startupDelayMs: 10 });
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    // 最初の timer はキャンセルされているため、実行は1回だけ
    expect(r.calls).toHaveLength(1);
    r.stop();
  });

  it('non-Error exception in runImpl is stringified into lastError', async () => {
    const r = makeRunner(async () => {
      // eslint-disable-next-line no-throw-literal
      throw 'string-error';
    });
    const s = await r.runOnce('manual');
    expect(s.lastError).toBe('string-error');
    expect(s.ticksRun).toBe(0);
  });
});
