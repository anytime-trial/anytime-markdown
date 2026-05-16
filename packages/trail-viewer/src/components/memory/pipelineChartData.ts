import type { MemoryPipelineRunRow } from '../../data/types';

export interface PipelineChartBar {
  readonly scope: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly status: string;
  readonly itemsProcessed: number;
}

export function buildPipelineChartBars(runs: readonly MemoryPipelineRunRow[]): readonly PipelineChartBar[] {
  return runs.map((r) => {
    const start = new Date(r.startedAt).getTime();
    const end = r.completedAt ? new Date(r.completedAt).getTime() : start;
    return {
      scope: r.scope,
      startedAt: r.startedAt,
      durationMs: Math.max(0, end - start),
      status: r.status,
      itemsProcessed: r.itemsProcessed,
    };
  });
}

export function groupRunsByScope(runs: readonly MemoryPipelineRunRow[]): ReadonlyMap<string, readonly MemoryPipelineRunRow[]> {
  const map = new Map<string, MemoryPipelineRunRow[]>();
  for (const r of runs) {
    if (!map.has(r.scope)) map.set(r.scope, []);
    map.get(r.scope)!.push(r);
  }
  return map;
}
