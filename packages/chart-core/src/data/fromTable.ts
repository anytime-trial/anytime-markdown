import type { ChartSpec, Series, TableMapping, TableRange } from "../types";

/** "1,500" / " 100 " 等を数値化。不能なら null。 */
function parseNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sliceRange<T>(rows: ReadonlyArray<ReadonlyArray<T>>, range: TableRange): T[][] {
  const out: T[][] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const row = rows[r] ?? [];
    const cols: T[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) cols.push(row[c]);
    out.push(cols);
  }
  return out;
}

/**
 * 表データ・範囲・マッピングから ChartSpec を導出する純粋変換。
 * - line/bar: orientation で系列方向を決め、headerRow/categoryCol からカテゴリと系列名を取る。
 * - scatter: 範囲の最初の2列を (x, y) とし、数値化できない行は除外する。
 */
export function fromTable(
  cells: ReadonlyArray<ReadonlyArray<string>>,
  range: TableRange,
  mapping: TableMapping,
): ChartSpec {
  const grid = sliceRange(cells, range);
  const headerRow = mapping.headerRow ?? true;

  if (mapping.kind === "scatter") {
    const body = headerRow ? grid.slice(1) : grid;
    const points = body
      .map((row) => ({ x: parseNum(row[0]), y: parseNum(row[1]) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    const name = headerRow ? `${grid[0]?.[0] ?? "x"} / ${grid[0]?.[1] ?? "y"}` : "series";
    return { kind: "scatter", series: [{ name, points }] };
  }

  // line / bar
  const orientation = mapping.orientation ?? "columns";
  const categoryCol = mapping.categoryCol ?? 0;

  if (orientation === "rows") {
    // 行 = 系列、列 = カテゴリ
    const headerCols = headerRow ? grid[0] : undefined;
    const body = headerRow ? grid.slice(1) : grid;
    const categories = (headerCols ?? []).slice(1).map((c, i) => c ?? `#${i + 1}`);
    const series: Series[] = body.map((row, i) => ({
      name: row[0] ?? `series ${i + 1}`,
      values: row.slice(1).map(parseNum),
    }));
    return { kind: mapping.kind, categories, series };
  }

  // columns: 列 = 系列、行 = カテゴリ
  const header = headerRow ? grid[0] : undefined;
  const body = headerRow ? grid.slice(1) : grid;
  const categories = body.map((row, i) => row[categoryCol] ?? `#${i + 1}`);
  const colCount = grid[0]?.length ?? 0;
  const series: Series[] = [];
  for (let c = 0; c < colCount; c++) {
    if (c === categoryCol) continue;
    series.push({
      name: header?.[c] ?? `series ${c + 1}`,
      values: body.map((row) => parseNum(row[c])),
    });
  }
  return { kind: mapping.kind, categories, series };
}
