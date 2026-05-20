import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { CoverageImporter } from '../CoverageImporter';

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
  importCoverageCalls: string[];
  importCurrentCoverageCalls: Array<{ gitRoot: string; repoName: string }>;
  importCoverageImpl: (gitRoot: string) => number;
  importCurrentCoverageImpl: (gitRoot: string, repoName: string) => number;
}

function makeFakeTrailDb(state: FakeDbState): TrailDatabase {
  return {
    importCoverage: (gitRoot: string) => {
      state.importCoverageCalls.push(gitRoot);
      return state.importCoverageImpl(gitRoot);
    },
    importCurrentCoverage: (gitRoot: string, repoName: string) => {
      state.importCurrentCoverageCalls.push({ gitRoot, repoName });
      return state.importCurrentCoverageImpl(gitRoot, repoName);
    },
  } as unknown as TrailDatabase;
}

describe('CoverageImporter', () => {
  it('imports coverage when at least one coverage_report event seen', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 10,
      importCurrentCoverageImpl: () => 7,
    };
    const trailDb = makeFakeTrailDb(state);
    const phaseEvents: string[] = [];
    const importer = new CoverageImporter({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'foo', filePath: '/x/foo.json', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(state.importCoverageCalls).toEqual(['/work/anytime-markdown']);
    expect(state.importCurrentCoverageCalls).toEqual([
      { gitRoot: '/work/anytime-markdown', repoName: 'anytime-markdown' },
    ]);
    expect(importer.getCounters()).toEqual({ coverageImported: 10, currentCoverageImported: 7 });
    expect(phaseEvents).toEqual(['import_coverage:start', 'import_coverage:finish']);
  });

  it('skips when no coverage_report event matches primary gitRoot', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 1,
      importCurrentCoverageImpl: () => 1,
    };
    const phaseEvents: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/primary'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/other/repo' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(state.importCoverageCalls).toEqual([]);
    expect(phaseEvents).toEqual(['import_coverage:skip']);
  });

  it('skips entirely when gitRoots is empty', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 0,
      importCurrentCoverageImpl: () => 0,
    };
    const phaseEvents: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: [],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onRunEnd(ctx);

    expect(state.importCoverageCalls).toEqual([]);
    expect(phaseEvents).toEqual(['import_coverage:skip']);
  });

  it('continues to importCurrentCoverage even if importCoverage throws', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => { throw new Error('fs error'); },
      importCurrentCoverageImpl: () => 5,
    };
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(state.importCurrentCoverageCalls).toHaveLength(1);
    expect(importer.getCounters()).toEqual({ coverageImported: 0, currentCoverageImported: 5 });
  });

  it('fires error phase only once when both importCoverage and importCurrentCoverage throw', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => { throw new Error('coverage error'); },
      importCurrentCoverageImpl: () => { throw new Error('current error'); },
    };
    const phaseEvents: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    // error phase should fire once (from importCoverage), NOT again from importCurrentCoverage
    expect(phaseEvents).toEqual(['import_coverage:start', 'import_coverage:error']);
    expect(phaseEvents.filter((e) => e === 'import_coverage:error')).toHaveLength(1);
    expect(importer.getCounters()).toEqual({ coverageImported: 0, currentCoverageImported: 0 });
  });

  it('invokes onProgress callbacks with correct messages during success', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 5,
      importCurrentCoverageImpl: () => 3,
    };
    const progressMessages: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onProgress: (msg) => progressMessages.push(msg),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(progressMessages).toContain('Importing coverage data...');
    expect(progressMessages).toContain('Coverage imported: 5 entries');
    expect(progressMessages).toContain('Importing current coverage snapshot...');
    expect(progressMessages).toContain('Current coverage imported: 3 entries');
  });

  it('uses String(err) in error phase when non-Error is thrown by importCoverage', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      importCoverageImpl: () => { throw 'non-error string'; },
      importCurrentCoverageImpl: () => 0,
    };
    const phaseMessages: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => { if (e.action === 'error' && 'message' in e) phaseMessages.push(e.message ?? ''); },
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(phaseMessages).toEqual(['non-error string']);
  });

  it('fires error phase only once when importCoverage succeeds but importCurrentCoverage fails', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 4,
      importCurrentCoverageImpl: () => { throw new Error('current error'); },
    };
    const phaseEvents: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['import_coverage:start', 'import_coverage:error']);
    expect(importer.getCounters()).toEqual({ coverageImported: 4, currentCoverageImported: 0 });
  });

  it('uses String(err) when non-Error is thrown by importCurrentCoverage', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 2,
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      importCurrentCoverageImpl: () => { throw 'string error'; },
    };
    const phaseMessages: string[] = [];
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => { if (e.action === 'error' && 'message' in e) phaseMessages.push(e.message ?? ''); },
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    await importer.onEvent(
      { kind: 'coverage_report', pkg: 'p', filePath: '/x', gitRoot: '/work/anytime-markdown' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    expect(phaseMessages).toEqual(['string error']);
  });

  it('ignores non-coverage_report events', async () => {
    const state: FakeDbState = {
      importCoverageCalls: [],
      importCurrentCoverageCalls: [],
      importCoverageImpl: () => 0,
      importCurrentCoverageImpl: () => 0,
    };
    const importer = new CoverageImporter({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await importer.onRunStart(ctx);
    // send a non-coverage_report event - should not affect seenRoots
    await importer.onEvent(
      { kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' },
      ctx,
    );
    await importer.onRunEnd(ctx);

    // no coverage_report for primary → skip
    expect(state.importCoverageCalls).toEqual([]);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const importer = new CoverageImporter({
      trailDb: {} as unknown as TrailDatabase,
      gitRoots: [],
    });
    expect(importer.tier).toBe(2);
    expect(importer.id).toBe('CoverageImporter');
    expect(importer.subscribes).toEqual(['coverage_report']);
    expect(importer.emits).toEqual([]);
  });
});
