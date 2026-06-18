import type { ChartKind, ChartSpec, Series, TableRange } from "../types";
import { fromTable, parseNum } from "./fromTable";

/** 数値を表セル文字列へ。null/NaN は空文字。 */
function numCell(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "" : String(v);
}

/**
 * ChartSpec を表セル（string[][]）へ変換する（編集ダイアログの表タブ seed 用）。
 * - line/bar: 先頭行 = ["", ...系列名]、各行 = [カテゴリ, 値0, 値1, ...]
 * - scatter: 系列ごと x,y の2列。先頭行 = [`${名前} x`, `${名前} y`, ...]、行は points を縦に並べる
 */
export function chartSpecToCells(spec: ChartSpec): string[][] {
  if (spec.kind === "scatter") {
    const header = spec.series.flatMap((s) => [`${s.name} x`, `${s.name} y`]);
    const maxLen = Math.max(0, ...spec.series.map((s) => (s.points ?? []).length));
    const rows: string[][] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: string[] = [];
      for (const s of spec.series) {
        const p = (s.points ?? [])[i];
        row.push(p ? numCell(p.x) : "", p ? numCell(p.y) : "");
      }
      rows.push(row);
    }
    return [header, ...rows];
  }

  // line / bar
  const header = ["", ...spec.series.map((s) => s.name)];
  const categories = spec.categories ?? [];
  const rowCount = Math.max(categories.length, ...spec.series.map((s) => (s.values ?? []).length));
  const rows: string[][] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push([categories[i] ?? "", ...spec.series.map((s) => numCell((s.values ?? [])[i]))]);
  }
  return [header, ...rows];
}

function fullRange(cells: ReadonlyArray<ReadonlyArray<string>>): TableRange {
  return {
    startRow: 0,
    startCol: 0,
    endRow: Math.max(0, cells.length - 1),
    endCol: Math.max(0, (cells[0]?.length ?? 1) - 1),
  };
}

/** 見出しの末尾 " x" / " y" を除いた系列名。 */
function stripAxisSuffix(header: string | undefined): string {
  return (header ?? "").replace(/\s*[xy]$/i, "").trim();
}

function scatterFromCells(cells: ReadonlyArray<ReadonlyArray<string>>): Series[] {
  const header = cells[0] ?? [];
  const body = cells.slice(1);
  const series: Series[] = [];
  for (let c = 0; c + 1 < header.length; c += 2) {
    const name = stripAxisSuffix(header[c]) || `series ${c / 2 + 1}`;
    const points = body
      .map((row) => ({ x: parseNum(row[c]), y: parseNum(row[c + 1]) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    series.push({ name, points });
  }
  return series;
}

/**
 * 表セル（string[][]）を ChartSpec へ変換する。
 * `base` から title / options を引き継ぎ、データのみ差し替える（kind は引数を優先）。
 */
export function cellsToChartSpec(
  cells: ReadonlyArray<ReadonlyArray<string>>,
  kind: ChartKind,
  base?: ChartSpec,
): ChartSpec {
  const carry = { title: base?.title, options: base?.options };

  if (kind === "scatter") {
    return { kind, series: scatterFromCells(cells), ...carry };
  }

  const derived = fromTable(cells, fullRange(cells), {
    kind,
    headerRow: true,
    categoryCol: 0,
    orientation: "columns",
  });
  return { kind, categories: derived.categories, series: derived.series, ...carry };
}
