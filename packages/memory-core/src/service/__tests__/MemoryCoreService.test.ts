import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { MemoryCoreService } from '../MemoryCoreService';
import { readState } from '../state';
import type {
  MemoryCoreServiceOptions,
  PipelineRunnerContext,
} from '../types';

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

function makeOpts(
  dir: string,
  overrides: Partial<MemoryCoreServiceOptions> = {},
): MemoryCoreServiceOptions {
  return {
    logSink: makeLogSink(),
    trailDbPath: join(dir, 'trail.db'),
    dbPath: join(dir, 'memory-core.db'),
    statePath: join(dir, 'memory-core-runner.json'),
    pipelineRunner: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('MemoryCoreService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memcore-svc-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('initial state', () => {
    it('starts with paused=false, lastRunAt=null when no state file exists', () => {
      const svc = new MemoryCoreService(makeOpts(dir));
      const s = svc.getStatus();
      expect(s.paused).toBe(false);
      expect(s.lastRunAt).toBeNull();
      expect(s.ticksRun).toBe(0);
      expect(s.ticksSkipped).toBe(0);
      expect(s.running).toBe(false);
    });

    it('restores persisted pause state on construction', async () => {
      const opts = makeOpts(dir);
      const svc1 = new MemoryCoreService(opts);
      await svc1.pause('cli');
      const svc2 = new MemoryCoreService(opts);
      expect(svc2.getStatus().paused).toBe(true);
      expect(svc2.getStatus().pausedBy).toBe('cli');
    });
  });

  describe('pause/resume', () => {
    it('pause(by) sets paused=true and persists to state file', async () => {
      const opts = makeOpts(dir);
      const svc = new MemoryCoreService(opts);
      const status = await svc.pause('cli');
      expect(status.paused).toBe(true);
      expect(status.pausedBy).toBe('cli');
      expect(status.pausedAt).not.toBeNull();

      expect(existsSync(opts.statePath!)).toBe(true);
      const persisted = readState(opts.statePath!);
      expect(persisted.paused).toBe(true);
      expect(persisted.pausedBy).toBe('cli');
    });

    it('resume() sets paused=false and persists', async () => {
      const opts = makeOpts(dir);
      const svc = new MemoryCoreService(opts);
      await svc.pause('cli');
      const status = await svc.resume();
      expect(status.paused).toBe(false);
      expect(status.pausedBy).toBeNull();
      expect(status.pausedAt).toBeNull();

      const persisted = readState(opts.statePath!);
      expect(persisted.paused).toBe(false);
    });
  });

  describe('runOnce', () => {
    it("runOnce('manual') invokes the pipeline and updates lastRunAt + lastReason", async () => {
      const pipelineRunner = jest.fn(async () => undefined);
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      const status = await svc.runOnce('manual');
      expect(pipelineRunner).toHaveBeenCalledTimes(1);
      expect(status.lastReason).toBe('manual');
      expect(status.lastRunAt).not.toBeNull();
      expect(status.lastDurationMs).not.toBeNull();
      expect(status.lastError).toBeNull();
      expect(status.ticksRun).toBe(1);
    });

    it("skips periodic tick while paused and increments ticksSkipped", async () => {
      const pipelineRunner = jest.fn(async () => undefined);
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      await svc.pause('cli');
      await svc.runOnce('periodic');
      expect(pipelineRunner).not.toHaveBeenCalled();
      const s = svc.getStatus();
      expect(s.ticksSkipped).toBe(1);
      expect(s.ticksRun).toBe(0);
    });

    it("skips startup tick while paused", async () => {
      const pipelineRunner = jest.fn(async () => undefined);
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      await svc.pause('cli');
      await svc.runOnce('startup');
      expect(pipelineRunner).not.toHaveBeenCalled();
      expect(svc.getStatus().ticksSkipped).toBe(1);
    });

    it("runOnce('manual') overrides pause and executes the pipeline", async () => {
      const pipelineRunner = jest.fn(async () => undefined);
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      await svc.pause('cli');
      await svc.runOnce('manual');
      expect(pipelineRunner).toHaveBeenCalledTimes(1);
      expect(svc.getStatus().ticksRun).toBe(1);
      // paused stays true — manual is a one-shot override, not a resume
      expect(svc.getStatus().paused).toBe(true);
    });

    it("runOnce('import') overrides pause (Analyze All counts as a user action)", async () => {
      const pipelineRunner = jest.fn(async () => undefined);
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      await svc.pause('cli');
      await svc.runOnce('import');
      expect(pipelineRunner).toHaveBeenCalledTimes(1);
      expect(svc.getStatus().ticksRun).toBe(1);
    });

    it('serializes concurrent runOnce calls via internal mutex', async () => {
      let active = 0;
      let maxActive = 0;
      let order: string[] = [];
      const pipelineRunner = jest.fn(async (ctx: PipelineRunnerContext) => {
        active++;
        maxActive = Math.max(maxActive, active);
        order.push('start:' + ctx.trailDbPath);
        await new Promise((r) => setTimeout(r, 30));
        order.push('end:' + ctx.trailDbPath);
        active--;
      });
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);

      const a = svc.runOnce('manual');
      const b = svc.runOnce('manual');
      await Promise.all([a, b]);

      expect(pipelineRunner).toHaveBeenCalledTimes(2);
      expect(maxActive).toBe(1);
      expect(svc.getStatus().ticksRun).toBe(2);
    });

    it('records lastError when the pipeline throws and does not throw to caller', async () => {
      const pipelineRunner = jest.fn(async () => {
        throw new Error('boom');
      });
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      const status = await svc.runOnce('manual');
      expect(status.lastError).toContain('boom');
      // ticksRun does not increment on error
      expect(status.ticksRun).toBe(0);
    });

    it('clears lastError on successful subsequent run', async () => {
      let calls = 0;
      const pipelineRunner = jest.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('first fails');
      });
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      await svc.runOnce('manual');
      expect(svc.getStatus().lastError).toContain('first fails');
      await svc.runOnce('manual');
      expect(svc.getStatus().lastError).toBeNull();
      expect(svc.getStatus().ticksRun).toBe(1);
    });

    it('persists status after runOnce completes', async () => {
      const opts = makeOpts(dir);
      const svc = new MemoryCoreService(opts);
      await svc.runOnce('manual');
      const persisted = readState(opts.statePath!);
      expect(persisted.ticksRun).toBe(1);
      expect(persisted.lastReason).toBe('manual');
    });

    it('writes valid JSON to the state file after pause + runOnce', async () => {
      const opts = makeOpts(dir);
      const svc = new MemoryCoreService(opts);
      await svc.pause('cli');
      await svc.runOnce('manual');
      const raw = readFileSync(opts.statePath!, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.paused).toBe(true);
      expect(parsed.ticksRun).toBe(1);
    });
  });

  describe('start/stop', () => {
    it('start schedules periodic ticks and runOnStart tick', async () => {
      jest.useFakeTimers();
      try {
        const pipelineRunner = jest.fn(async () => undefined);
        const opts = makeOpts(dir, { pipelineRunner });
        const svc = new MemoryCoreService(opts);

        svc.start(10_000, { runOnStart: true, startupDelayMs: 100 });

        // before startup delay
        expect(pipelineRunner).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(100);
        // microtasks need to flush for the async runOnce
        jest.useRealTimers();
        await new Promise((r) => setImmediate(r));
        expect(pipelineRunner).toHaveBeenCalledTimes(1);

        svc.stop();
      } finally {
        jest.useRealTimers();
      }
    });

    it('start with runOnStart=false skips the initial tick', async () => {
      jest.useFakeTimers();
      try {
        const pipelineRunner = jest.fn(async () => undefined);
        const opts = makeOpts(dir, { pipelineRunner });
        const svc = new MemoryCoreService(opts);
        svc.start(10_000, { runOnStart: false, startupDelayMs: 100 });

        jest.advanceTimersByTime(500);
        jest.useRealTimers();
        await new Promise((r) => setImmediate(r));
        expect(pipelineRunner).toHaveBeenCalledTimes(0);

        svc.stop();
      } finally {
        jest.useRealTimers();
      }
    });

    it('stop prevents future ticks', async () => {
      jest.useFakeTimers();
      try {
        const pipelineRunner = jest.fn(async () => undefined);
        const opts = makeOpts(dir, { pipelineRunner });
        const svc = new MemoryCoreService(opts);
        svc.start(1000, { runOnStart: false, startupDelayMs: 0 });
        svc.stop();
        jest.advanceTimersByTime(5_000);
        jest.useRealTimers();
        await new Promise((r) => setImmediate(r));
        expect(pipelineRunner).toHaveBeenCalledTimes(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('dispose', () => {
    it('dispose waits for in-flight runOnce and persists final state', async () => {
      let resolved = false;
      const pipelineRunner = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
        resolved = true;
      });
      const opts = makeOpts(dir, { pipelineRunner });
      const svc = new MemoryCoreService(opts);
      const run = svc.runOnce('manual');
      await svc.dispose();
      // dispose awaits any in-flight run via mutex
      await run;
      expect(resolved).toBe(true);
    });
  });
});
