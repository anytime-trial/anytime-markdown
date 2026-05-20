import type { C4Model } from '../c4/types';
import { buildPathToCodeIdIndex } from './pathIndex';
import type { HeatmapAxis, HeatmapCell, HeatmapMatrix } from './types';

export function aggregateHeatmapColumnsToC4(
  rows: readonly HeatmapAxis[],
  cellsByRowFile: ReadonlyMap<string, ReadonlyMap<string, number>>,
  c4Model: C4Model,
): HeatmapMatrix {
  const pathIndex = buildPathToCodeIdIndex(c4Model);
  const elementById = new Map(c4Model.elements.map((el) => [el.id, el] as const));

  const { sumByRowElement, elementIds } = accumulateByRowElement(cellsByRowFile, pathIndex);

  const columns: HeatmapAxis[] = Array.from(elementIds)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      label: elementById.get(id)?.name ?? id,
    }));

  const colIndexById = new Map(columns.map((c, i) => [c.id, i] as const));
  const rowIndexById = new Map(rows.map((r, i) => [r.id, i] as const));

  const { cells, maxValue } = buildHeatmapCells(sumByRowElement, rowIndexById, colIndexById);

  return { rows, columns, cells, maxValue };
}

// Sum each row's per-file values onto the C4 element(s) the file maps to.
function accumulateByRowElement(
  cellsByRowFile: ReadonlyMap<string, ReadonlyMap<string, number>>,
  pathIndex: ReturnType<typeof buildPathToCodeIdIndex>,
): { sumByRowElement: Map<string, Map<string, number>>; elementIds: Set<string> } {
  const sumByRowElement = new Map<string, Map<string, number>>();
  const elementIds = new Set<string>();
  for (const [rowKey, fileMap] of cellsByRowFile) {
    const acc = sumByRowElement.get(rowKey) ?? new Map<string, number>();
    for (const [filePath, value] of fileMap) {
      const ids = pathIndex.get(stripExtKey(filePath)) ?? [];
      for (const id of ids) {
        acc.set(id, (acc.get(id) ?? 0) + value);
        elementIds.add(id);
      }
    }
    sumByRowElement.set(rowKey, acc);
  }
  return { sumByRowElement, elementIds };
}

// Flatten the row→element sums into matrix cells, tracking the max value.
function buildHeatmapCells(
  sumByRowElement: ReadonlyMap<string, ReadonlyMap<string, number>>,
  rowIndexById: ReadonlyMap<string, number>,
  colIndexById: ReadonlyMap<string, number>,
): { cells: HeatmapCell[]; maxValue: number } {
  const cells: HeatmapCell[] = [];
  let maxValue = 0;
  for (const [rowKey, acc] of sumByRowElement) {
    const rowIndex = rowIndexById.get(rowKey);
    if (rowIndex === undefined) continue;
    for (const [elementId, value] of acc) {
      const colIndex = colIndexById.get(elementId);
      if (colIndex === undefined) continue;
      cells.push({ rowIndex, colIndex, value });
      if (value > maxValue) maxValue = value;
    }
  }
  return { cells, maxValue };
}

function stripExtKey(filePath: string): string {
  return filePath.replace(/\.(tsx?|mdx?)$/, '');
}
