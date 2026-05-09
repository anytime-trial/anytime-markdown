import { buildPipelineChartBars, groupRunsByScope } from '../pipelineChartData';
import type { MemoryPipelineRunRow } from '../../../data/types';

function makeRun(overrides: Partial<MemoryPipelineRunRow>): MemoryPipelineRunRow {
  return {
    id: 'r1',
    scope: 'drift',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:10.000Z',
    status: 'success',
    itemsProcessed: 5,
    errorMessage: null,
    ...overrides,
  };
}

describe('buildPipelineChartBars', () => {
  it('returns empty array for empty input', () => {
    expect(buildPipelineChartBars([])).toHaveLength(0);
  });

  it('computes duration from startedAt and completedAt', () => {
    const bars = buildPipelineChartBars([makeRun({})]);
    expect(bars[0].durationMs).toBe(10000);
  });

  it('uses 0 for duration when completedAt is null', () => {
    const bars = buildPipelineChartBars([makeRun({ completedAt: null })]);
    expect(bars[0].durationMs).toBe(0);
  });

  it('preserves scope and status', () => {
    const bars = buildPipelineChartBars([makeRun({ scope: 'review', status: 'error' })]);
    expect(bars[0].scope).toBe('review');
    expect(bars[0].status).toBe('error');
  });

  it('processes multiple runs', () => {
    const runs = [
      makeRun({ id: 'r1', scope: 'drift' }),
      makeRun({ id: 'r2', scope: 'spec' }),
    ];
    expect(buildPipelineChartBars(runs)).toHaveLength(2);
  });
});

describe('groupRunsByScope', () => {
  it('returns empty map for empty input', () => {
    const map = groupRunsByScope([]);
    expect(map.size).toBe(0);
  });

  it('groups runs by scope', () => {
    const runs = [
      makeRun({ id: 'r1', scope: 'drift' }),
      makeRun({ id: 'r2', scope: 'drift' }),
      makeRun({ id: 'r3', scope: 'spec' }),
    ];
    const map = groupRunsByScope(runs);
    expect(map.size).toBe(2);
    expect(map.get('drift')).toHaveLength(2);
    expect(map.get('spec')).toHaveLength(1);
  });
});
