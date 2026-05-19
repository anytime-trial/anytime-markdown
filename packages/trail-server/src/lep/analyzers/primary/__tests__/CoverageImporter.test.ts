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
