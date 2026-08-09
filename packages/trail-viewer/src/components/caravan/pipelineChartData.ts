import type { CaravanPipelineRunStatsByDayRow, CaravanPipelineRunStatus } from '../../data/types';

export interface StackedSeries {
  readonly scope: string;
  readonly data: readonly number[];
}

export interface StackedChartData {
  readonly xLabels: readonly string[];
  readonly series: readonly StackedSeries[];
  readonly dayWorstStatus: ReadonlyMap<string, CaravanPipelineRunStatus>;
}

const STATUS_RANK: Record<CaravanPipelineRunStatus, number> = {
  error: 3,
  partial: 2,
  success: 1,
  running: 0,
};

function rankToStatus(rank: number): CaravanPipelineRunStatus {
  if (rank >= 3) return 'error';
  if (rank === 2) return 'partial';
  if (rank === 1) return 'success';
  return 'running';
}

export function buildStackedChartData(
  rows: readonly CaravanPipelineRunStatsByDayRow[],
): StackedChartData {
  if (rows.length === 0) {
    return { xLabels: [], series: [], dayWorstStatus: new Map() };
  }

  const xLabels = [...new Set(rows.map((r) => r.day))].sort();
  const scopes = [...new Set(rows.map((r) => r.scope))].sort();

  // (day, scope) -> durationSec lookup for O(1) data alignment
  const lookup = new Map<string, number>();
  for (const r of rows) {
    lookup.set(`${r.day}|${r.scope}`, r.durationSec);
  }

  const series = scopes.map((scope) => ({
    scope,
    data: xLabels.map((day) => lookup.get(`${day}|${scope}`) ?? 0),
  }));

  const dayWorstRank = new Map<string, number>();
  for (const r of rows) {
    const cur = dayWorstRank.get(r.day) ?? 0;
    const next = STATUS_RANK[r.worstStatus];
    if (next > cur) dayWorstRank.set(r.day, next);
  }
  const dayWorstStatus = new Map<string, CaravanPipelineRunStatus>();
  for (const [day, rank] of dayWorstRank) {
    dayWorstStatus.set(day, rankToStatus(rank));
  }

  return { xLabels, series, dayWorstStatus };
}
