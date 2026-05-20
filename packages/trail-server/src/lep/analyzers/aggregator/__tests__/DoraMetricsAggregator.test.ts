import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { DoraMetricRow } from '@anytime-markdown/trail-db';

import { DoraMetricsAggregator, type DoraDataSource } from '../DoraMetricsAggregator';

function makeCtx(): { ctx: AnalyzerContext; logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  const bus: EventBusPublisher = { publish: async () => undefined };
  return {
    logs,
    errors,
    ctx: {
      runId: 'r1',
      reason: 'manual',
      logger: { info: (m) => logs.push(m), error: (m) => errors.push(m) },
      bus,
    },
  };
}

function makeDataSource(overrides: Partial<DoraDataSource> = {}): {
  ds: DoraDataSource;
  written: DoraMetricRow[][];
} {
  const written: DoraMetricRow[][] = [];
  const ds: DoraDataSource = {
    getDoraReleases: () => [],
    getDoraCommits: () => [],
    replaceDoraMetrics: (rows) => {
      written.push([...rows]);
    },
    ...overrides,
  };
  return { ds, written };
}

const NOW = () => new Date('2026-05-19T00:00:00.000Z');

describe('DoraMetricsAggregator', () => {
  it('exposes tier=4 self-read analyzer subscribing wave_start', () => {
    const { ds } = makeDataSource();
    const agg = new DoraMetricsAggregator({ trailDb: ds });
    expect(agg.id).toBe('DoraMetricsAggregator');
    expect(agg.tier).toBe(4);
    expect(agg.inputMode).toBe('self-read');
    expect(agg.subscribes).toEqual(['wave_start']);
    expect((agg as Analyzer).requiresLlm).toBeUndefined();
  });

  it('computes and stores metrics on wave_start:derived', async () => {
    const { ds, written } = makeDataSource({
      getDoraReleases: () => [
        { tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z', repoName: 'repoA' },
      ],
      getDoraCommits: () => [
        { commitHash: 'c1', committedAt: '2026-01-09T00:00:00.000Z', repoName: 'repoA' },
      ],
    });
    const agg = new DoraMetricsAggregator({ trailDb: ds, now: NOW });
    const { ctx, logs } = makeCtx();

    await agg.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    expect(written).toHaveLength(1);
    expect(written[0]).toEqual([
      {
        repoName: 'repoA',
        period: '2026-01',
        deploymentFrequency: 1,
        leadTimeHours: 24,
        computedAt: '2026-05-19T00:00:00.000Z',
      },
    ]);
    expect(agg.getPeriodsComputed()).toBe(1);
    expect(logs.join('\n')).toContain('[DoraMetricsAggregator] done');
  });

  it('writes empty metrics without throwing when there are no releases', async () => {
    const { ds, written } = makeDataSource();
    const agg = new DoraMetricsAggregator({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();

    await agg.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    expect(written).toEqual([[]]);
    expect(agg.getPeriodsComputed()).toBe(0);
  });

  it('ignores wave_start for non-derived waves', async () => {
    const { ds, written } = makeDataSource();
    const agg = new DoraMetricsAggregator({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();

    for (const wave of ['sources', 'primary', 'memory'] as const) {
      await agg.onEvent({ kind: 'wave_start', wave }, ctx);
    }
    expect(written).toEqual([]);
  });

  it('ignores unrelated events', async () => {
    const { ds, written } = makeDataSource();
    const agg = new DoraMetricsAggregator({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();

    await agg.onEvent({ kind: 'wave_complete', wave: 'derived' } as AnalyzerEvent, ctx);
    await agg.onEvent(
      { kind: 'release_resolved', tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z' },
      ctx,
    );
    expect(written).toEqual([]);
  });

  it('logs error and does not throw when the data source fails', async () => {
    const { ds } = makeDataSource({
      replaceDoraMetrics: () => {
        throw new Error('disk full');
      },
    });
    const agg = new DoraMetricsAggregator({ trailDb: ds, now: NOW });
    const { ctx, errors } = makeCtx();

    await expect(
      agg.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx),
    ).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('[DoraMetricsAggregator] failed: disk full');
  });
});
