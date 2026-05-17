import { buildStackedChartData } from '../pipelineChartData';
import type { MemoryPipelineRunStatsByDayRow } from '../../../data/types';

function row(overrides: Partial<MemoryPipelineRunStatsByDayRow>): MemoryPipelineRunStatsByDayRow {
  return {
    day: '2026-05-16',
    scope: 'drift',
    runs: 1,
    durationSec: 10,
    itemsProcessed: 1,
    worstStatus: 'success',
    ...overrides,
  };
}

describe('buildStackedChartData', () => {
  it('returns empty xLabels and series for empty input', () => {
    const result = buildStackedChartData([]);
    expect(result.xLabels).toEqual([]);
    expect(result.series).toEqual([]);
    expect(result.dayWorstStatus.size).toBe(0);
  });

  it('xLabels are unique days sorted ascending (older → newer, chart reads left→right)', () => {
    const result = buildStackedChartData([
      row({ day: '2026-05-16', scope: 'drift' }),
      row({ day: '2026-05-14', scope: 'drift' }),
      row({ day: '2026-05-15', scope: 'drift' }),
    ]);
    expect(result.xLabels).toEqual(['2026-05-14', '2026-05-15', '2026-05-16']);
  });

  it('produces one series per scope, sorted by scope', () => {
    const result = buildStackedChartData([
      row({ day: '2026-05-16', scope: 'review' }),
      row({ day: '2026-05-16', scope: 'drift' }),
    ]);
    expect(result.series.map((s) => s.scope)).toEqual(['drift', 'review']);
  });

  it('aligns series data with xLabels and fills missing days with 0', () => {
    const result = buildStackedChartData([
      row({ day: '2026-05-15', scope: 'drift', durationSec: 100 }),
      row({ day: '2026-05-16', scope: 'review', durationSec: 50 }),
    ]);
    expect(result.xLabels).toEqual(['2026-05-15', '2026-05-16']);
    const drift = result.series.find((s) => s.scope === 'drift');
    const review = result.series.find((s) => s.scope === 'review');
    expect(drift?.data).toEqual([100, 0]);
    expect(review?.data).toEqual([0, 50]);
  });

  it('dayWorstStatus picks worst across all scopes (error > partial > success > running)', () => {
    const result = buildStackedChartData([
      row({ day: '2026-05-16', scope: 'drift', worstStatus: 'success' }),
      row({ day: '2026-05-16', scope: 'review', worstStatus: 'partial' }),
      row({ day: '2026-05-15', scope: 'drift', worstStatus: 'error' }),
      row({ day: '2026-05-15', scope: 'review', worstStatus: 'success' }),
    ]);
    expect(result.dayWorstStatus.get('2026-05-16')).toBe('partial');
    expect(result.dayWorstStatus.get('2026-05-15')).toBe('error');
  });
});
