import type { ActivityHeatmapRow, HeatmapAxis } from './types';

export interface ComputeHeatmapInput {
  readonly rows: readonly ActivityHeatmapRow[];
  readonly mode: 'session-file' | 'subagent-file';
  readonly topK: number;
  readonly rowLabelResolver?: (rowKey: string) => string;
}

export interface HeatmapIntermediate {
  readonly rows: readonly HeatmapAxis[];
  readonly cellsByRowFile: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly maxValue: number;
}

export function computeActivityHeatmap(input: ComputeHeatmapInput): HeatmapIntermediate {
  const { rows, topK, rowLabelResolver } = input;
  const totals = new Map<string, number>();
  const cellMap = new Map<string, Map<string, number>>();

  for (const { rowKey, filePath, count } of rows) {
    const fileMap = cellMap.get(rowKey) ?? new Map<string, number>();
    fileMap.set(filePath, (fileMap.get(filePath) ?? 0) + count);
    cellMap.set(rowKey, fileMap);
    totals.set(rowKey, (totals.get(rowKey) ?? 0) + count);
  }

  const sortedRowKeys = Array.from(totals.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(0, topK))
    .map(([k]) => k);

  const filteredCells = new Map<string, ReadonlyMap<string, number>>();
  let maxValue = 0;
  for (const key of sortedRowKeys) {
    const fileMap = cellMap.get(key);
    if (!fileMap) continue;
    filteredCells.set(key, fileMap);
    for (const v of fileMap.values()) {
      if (v > maxValue) maxValue = v;
    }
  }

  const labelOf = rowLabelResolver ?? ((k: string) => k);
  const rowsAxis: HeatmapAxis[] = sortedRowKeys.map((key) => ({
    id: key,
    label: labelOf(key),
  }));

  return {
    rows: rowsAxis,
    cellsByRowFile: filteredCells,
    maxValue,
  };
}
