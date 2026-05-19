import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryCoreService } from '@anytime-markdown/memory-core';
import type { AnalyzerContext, EventBusPublisher } from '@anytime-markdown/memory-core';

import { MemoryCoreLegacyAnalyzer } from '../MemoryCoreLegacyAnalyzer';

const dummyBus: EventBusPublisher = {
  publish: async () => undefined,
};

function makeCtx(reason: 'manual' | 'startup' | 'periodic' | 'import' = 'manual'): AnalyzerContext {
  return {
    runId: 'test-run',
    reason,
    logger: { info: () => undefined, error: () => undefined },
    bus: dummyBus,
  };
}

function makeMemoryCore(dir: string, pipelineRunner: jest.Mock = jest.fn(async () => undefined)) {
  return new MemoryCoreService({
    logSink: { appendLine: () => undefined },
    trailDbPath: join(dir, 'trail.db'),
    dbPath: join(dir, 'memory-core.db'),
    statePath: join(dir, 'memory-core-runner.json'),
    pipelineRunner,
  });
}

describe('MemoryCoreLegacyAnalyzer', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mem-legacy-analyzer-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('static identity exposes id=MemoryCoreLegacy, tier=3, subscribes wave_complete', () => {
    const mc = makeMemoryCore(dir);
    const a = new MemoryCoreLegacyAnalyzer(mc);
    expect(a.id).toBe('MemoryCoreLegacy');
    expect(a.tier).toBe(3);
    expect(a.subscribes).toEqual(['wave_complete']);
  });

  it('runs MemoryCoreService.runOnce when wave_complete primary fires', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const mc = makeMemoryCore(dir, pipelineRunner);
    const a = new MemoryCoreLegacyAnalyzer(mc);

    await a.onEvent({ kind: 'wave_complete', wave: 'primary' }, makeCtx());
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
  });

  it('does NOT run when wave_complete fires for non-primary waves', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const mc = makeMemoryCore(dir, pipelineRunner);
    const a = new MemoryCoreLegacyAnalyzer(mc);

    await a.onEvent({ kind: 'wave_complete', wave: 'sources' }, makeCtx());
    await a.onEvent({ kind: 'wave_complete', wave: 'memory' }, makeCtx());
    await a.onEvent({ kind: 'wave_complete', wave: 'derived' }, makeCtx());
    expect(pipelineRunner).not.toHaveBeenCalled();
  });

  it('throws when memory-core runs and records lastError', async () => {
    const pipelineRunner = jest.fn(async () => {
      throw new Error('mem boom');
    });
    const mc = makeMemoryCore(dir, pipelineRunner);
    const a = new MemoryCoreLegacyAnalyzer(mc);

    await expect(
      a.onEvent({ kind: 'wave_complete', wave: 'primary' }, makeCtx()),
    ).rejects.toThrow(/mem boom/);
  });

  it('does NOT throw when memory-core skipped (not ran) — e.g. paused internal', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const mc = makeMemoryCore(dir, pipelineRunner);
    await mc.pause('internal-test');
    const a = new MemoryCoreLegacyAnalyzer(mc);

    // periodic = auto reason → MemoryCoreService.runOnce skips internally
    await expect(
      a.onEvent({ kind: 'wave_complete', wave: 'primary' }, makeCtx('periodic')),
    ).resolves.toBeUndefined();
    expect(pipelineRunner).not.toHaveBeenCalled();
  });

  it('forwards ctx.reason to MemoryCoreService.runOnce', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const mc = makeMemoryCore(dir, pipelineRunner);
    const spy = jest.spyOn(mc, 'runOnce');
    const a = new MemoryCoreLegacyAnalyzer(mc);

    await a.onEvent({ kind: 'wave_complete', wave: 'primary' }, makeCtx('startup'));
    expect(spy).toHaveBeenCalledWith('startup');
  });
});
