import type { AnalyzerContext, EventBusPublisher } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { ImportAllLegacyAnalyzer } from '../ImportAllLegacyAnalyzer';

const dummyBus: EventBusPublisher = {
  publish: async () => undefined,
};

function makeCtx(): AnalyzerContext {
  return {
    runId: 'test-run',
    reason: 'manual',
    logger: { info: () => undefined, error: () => undefined },
    bus: dummyBus,
  };
}

function makeFakeTrailDb(importAll: jest.Mock): TrailDatabase {
  return { importAll } as unknown as TrailDatabase;
}

describe('ImportAllLegacyAnalyzer', () => {
  it('static identity exposes id=ImportAllLegacy, tier=2', () => {
    const a = new ImportAllLegacyAnalyzer({
      trailDb: makeFakeTrailDb(jest.fn()),
      gitRoots: [],
    });
    expect(a.id).toBe('ImportAllLegacy');
    expect(a.tier).toBe(2);
    expect(a.subscribes).toEqual([]);
  });

  it('onRunEnd calls trailDb.importAll with provided callbacks (no phase writer)', async () => {
    const importAll = jest.fn(async () => ({
      imported: 1,
      skipped: 0,
      commitsResolved: 0,
      releasesResolved: 0,
      releasesAnalyzed: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    }));
    const onImportProgress = jest.fn();
    const onImportPhase = jest.fn();
    const analyzeReleaseFn = jest.fn(async () => ({ nodes: [], edges: [], metadata: {} }));

    const a = new ImportAllLegacyAnalyzer({
      trailDb: makeFakeTrailDb(importAll),
      gitRoots: ['/repo'],
      onImportProgress,
      onImportPhase,
      analyzeReleaseFn: analyzeReleaseFn as unknown as NonNullable<
        ConstructorParameters<typeof ImportAllLegacyAnalyzer>[0]['analyzeReleaseFn']
      >,
    });

    await a.onRunEnd(makeCtx());

    expect(importAll).toHaveBeenCalledTimes(1);
    const args = importAll.mock.calls[0] as unknown as unknown[];
    expect(args[0]).toBe(onImportProgress);
    expect(args[1]).toEqual(['/repo']);
    expect(args[2]).toBeUndefined();
    expect(args[3]).toBe(analyzeReleaseFn);
    // phaseHandler is set because onImportPhase is provided
    expect(typeof args[4]).toBe('function');

    // phase handler dispatches to onImportPhase callback
    (args[4] as (e: unknown) => void)({ phase: 'session-import', action: 'start' });
    expect(onImportPhase).toHaveBeenCalledWith({ phase: 'session-import', action: 'start' });
  });

  it('onRunEnd skips phase handler when neither writer nor callback configured', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const a = new ImportAllLegacyAnalyzer({
      trailDb: makeFakeTrailDb(importAll),
      gitRoots: [],
    });

    await a.onRunEnd(makeCtx());

    const args = importAll.mock.calls[0] as unknown as unknown[];
    expect(args[4]).toBeUndefined();
  });

  it('getLastResult returns null before first run, then the result after', async () => {
    const result = {
      imported: 7,
      skipped: 1,
      commitsResolved: 0,
      releasesResolved: 0,
      releasesAnalyzed: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    };
    const importAll = jest.fn(async () => result);
    const a = new ImportAllLegacyAnalyzer({
      trailDb: makeFakeTrailDb(importAll),
      gitRoots: [],
    });
    expect(a.getLastResult()).toBeNull();

    await a.onRunEnd(makeCtx());
    expect(a.getLastResult()).toEqual(result);
  });

  it('throws and preserves previous lastResult when importAll fails', async () => {
    const importAllOk = jest.fn(async () => ({ imported: 3 }) as never);
    const importAllFail = jest.fn(async () => {
      throw new Error('boom');
    });
    const a = new ImportAllLegacyAnalyzer({
      trailDb: makeFakeTrailDb(importAllOk),
      gitRoots: [],
    });
    await a.onRunEnd(makeCtx());
    const prev = a.getLastResult();

    // Swap importAll to fail for the next call
    (a as unknown as { opts: { trailDb: TrailDatabase } }).opts.trailDb = makeFakeTrailDb(importAllFail);
    await expect(a.onRunEnd(makeCtx())).rejects.toThrow('boom');
    expect(a.getLastResult()).toEqual(prev);
  });
});
