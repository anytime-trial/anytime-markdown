/**
 * anytime-chart 編集ダイアログの「表」タブ用エディタ。
 * 現在の JSON（ChartSpec）を spreadsheet-viewer のグリッドに seed し、グリッド編集を
 * ChartSpec へ戻して setCode に反映する（JSON が正本・双方向同期）。
 */

import { chartSpecToCells, cellsToChartSpec, type ChartKind, type ChartSpec } from "@anytime-markdown/chart-core";
import {
  createInMemorySheetAdapter,
  type CellAlign,
  type SheetSnapshot,
} from "@anytime-markdown/spreadsheet-core";
import { mountSpreadsheetEditor } from "@anytime-markdown/spreadsheet-viewer";

/** string[][] から SheetSnapshot を組み立てる（alignment は未指定）。 */
function cellsToSnapshot(cells: string[][]): SheetSnapshot {
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const alignments: CellAlign[][] = cells.map((r) => r.map((): CellAlign => null));
  return { cells, alignments, range: { rows: Math.max(1, cells.length), cols } };
}

/** code(JSON) を ChartSpec へ。不正時は最小 line spec にフォールバック。 */
function parseSpec(code: string): ChartSpec {
  try {
    const spec = JSON.parse(code) as ChartSpec;
    if (spec && typeof spec === "object" && Array.isArray(spec.series)) return spec;
  } catch (err) {
    console.error("[createChartTableEditor] JSON parse failed", err);
  }
  return { kind: "line", categories: [], series: [] };
}

interface ChartTableEditorContext {
  getCode: () => string;
  setCode: (s: string) => void;
  isDark: boolean;
}

/**
 * 表エディタを container にマウントし、cleanup を返す（createCodeBlockEditDialog.leftAuxTab.mount 互換）。
 */
export function createChartTableEditor(
  container: HTMLElement,
  ctx: ChartTableEditorContext,
): () => void {
  const spec = parseSpec(ctx.getCode());
  const kind: ChartKind = spec.kind;
  const adapter = createInMemorySheetAdapter(cellsToSnapshot(chartSpecToCells(spec)));

  // グリッド編集を ChartSpec へ戻して setCode に反映する。
  // setCode → CodeEditState → render() は lnt とプレビューのみ更新し adapter を触らないため、
  // ここでの subscribe → setCode は再帰しない。
  const unsubscribe = adapter.subscribe(() => {
    const cells = adapter.getSnapshot().cells.map((row) => [...row]);
    const next = cellsToChartSpec(cells, kind, spec);
    ctx.setCode(JSON.stringify(next, null, 2));
  });

  const handle = mountSpreadsheetEditor(container, {
    adapter,
    themeMode: ctx.isDark ? "dark" : "light",
    showImportExport: false,
    // セル編集を Apply 不要で即 adapter へ反映し、プレビューをライブ更新する。
    liveSync: true,
    // グラフ対象セル範囲を太枠で示し、右端ドラッグで系列を増減できるようにする
    // （右端=列=系列 / 下端=行=カテゴリ/データ点）。1 行目は系列名のヘッダー。
    showRange: true,
    showHeaderRow: true,
  });

  return () => {
    unsubscribe();
    handle.destroy();
  };
}
