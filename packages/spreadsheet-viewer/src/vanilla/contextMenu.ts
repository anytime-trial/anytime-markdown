import type {
  CellAlign,
  ContextMenuState,
  DataRange,
  SheetAdapter,
  SheetSnapshot,
} from "@anytime-markdown/spreadsheet-core";

import type { SpreadsheetT } from "../i18n/createSpreadsheetT";
import { createSvDivider } from "../ui-vanilla/controls";
import { svIcon, type SvIconName } from "../ui-vanilla/icons";
import { createSvMenuItem, openSvMenu, type SvMenuHandle } from "../ui-vanilla/overlay";

/**
 * SpreadsheetContextMenu.tsx の vanilla 版。
 * メニュー構成（cell / row / col の 3 種・項目・disabled 条件・アイコン回転）と
 * snapshot 操作（adapter.replaceAll への反映条件 = dataRange 内のときのみ）は React 版と同一。
 */

/* ------------------------------------------------------------------ */
/*  Snapshot builders（React 版から移植した pure functions）             */
/* ------------------------------------------------------------------ */

function makeEmptyRow(cols: number): string[] {
  return Array.from({ length: cols }, () => "");
}

function makeEmptyAlignRow(cols: number): CellAlign[] {
  return Array.from<CellAlign>({ length: cols }).fill(null);
}

export function insertRowSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
  const cells = snapshot.cells.map((r) => [...r]);
  const alignments = snapshot.alignments.map((r) => [...r]);
  cells.splice(at, 0, makeEmptyRow(snapshot.range.cols));
  alignments.splice(at, 0, makeEmptyAlignRow(snapshot.range.cols));
  return {
    cells,
    alignments,
    range: { rows: snapshot.range.rows + 1, cols: snapshot.range.cols },
  };
}

export function deleteRowSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
  if (snapshot.range.rows <= 1) return snapshot;
  const cells = snapshot.cells.map((r) => [...r]);
  const alignments = snapshot.alignments.map((r) => [...r]);
  cells.splice(at, 1);
  alignments.splice(at, 1);
  return {
    cells,
    alignments,
    range: { rows: snapshot.range.rows - 1, cols: snapshot.range.cols },
  };
}

export function insertColSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
  const cells = snapshot.cells.map((row) => {
    const next = [...row];
    next.splice(at, 0, "");
    return next;
  });
  const alignments = snapshot.alignments.map((row) => {
    const next: CellAlign[] = [...row];
    next.splice(at, 0, null);
    return next;
  });
  return {
    cells,
    alignments,
    range: { rows: snapshot.range.rows, cols: snapshot.range.cols + 1 },
  };
}

export function deleteColSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
  if (snapshot.range.cols <= 1) return snapshot;
  const cells = snapshot.cells.map((row) => {
    const next = [...row];
    next.splice(at, 1);
    return next;
  });
  const alignments = snapshot.alignments.map((row) => {
    const next = [...row];
    next.splice(at, 1);
    return next;
  });
  return {
    cells,
    alignments,
    range: { rows: snapshot.range.rows, cols: snapshot.range.cols - 1 },
  };
}

export function swapRowsSnapshot(snapshot: SheetSnapshot, a: number, b: number): SheetSnapshot {
  const cells = snapshot.cells.map((r) => [...r]);
  const alignments = snapshot.alignments.map((r) => [...r]);
  [cells[a], cells[b]] = [cells[b], cells[a]];
  [alignments[a], alignments[b]] = [alignments[b], alignments[a]];
  return { cells, alignments, range: snapshot.range };
}

export function swapColsSnapshot(snapshot: SheetSnapshot, a: number, b: number): SheetSnapshot {
  const cells = snapshot.cells.map((row) => {
    const next = [...row];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  });
  const alignments = snapshot.alignments.map((row) => {
    const next = [...row];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  });
  return { cells, alignments, range: snapshot.range };
}

/* ------------------------------------------------------------------ */
/*  Menu                                                               */
/* ------------------------------------------------------------------ */

export interface SpreadsheetContextMenuCallbacks {
  adapter: SheetAdapter;
  dataRange: DataRange;
  grid: string[][];
  onClose: () => void;
  onInsertRow: (index: number) => void;
  onDeleteRow: (index: number) => void;
  onInsertCol: (index: number) => void;
  onDeleteCol: (index: number) => void;
  onSwapRows: (a: number, b: number) => void;
  onSwapCols: (a: number, b: number) => void;
  setDataRange: (range: DataRange) => void;
  setCellValue: (row: number, col: number, value: string) => void;
  onOpenFilter: () => void;
  t: SpreadsheetT;
}

interface CellRangeRect {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SpreadsheetContextMenuHandle {
  close(): void;
}

export function openSpreadsheetContextMenu(
  contextMenu: ContextMenuState,
  cb: SpreadsheetContextMenuCallbacks,
): SpreadsheetContextMenuHandle | null {
  const { anchorX, anchorY, target } = contextMenu;
  const { adapter, dataRange, grid, t } = cb;
  const indexTarget = target.type !== "cell" ? target : null;

  const getTargetCells = (): CellRangeRect | null => {
    if (target.type === "cell") {
      return { startRow: target.row, startCol: target.col, endRow: target.row, endCol: target.col };
    }
    if (target.type === "row") {
      const cols = grid[0]?.length ?? 0;
      return cols > 0
        ? { startRow: target.index, startCol: 0, endRow: target.index, endCol: cols - 1 }
        : null;
    }
    if (target.type === "col") {
      const rows = grid.length;
      return rows > 0
        ? { startRow: 0, startCol: target.index, endRow: rows - 1, endCol: target.index }
        : null;
    }
    return null;
  };

  const rangesToTsv = (range: CellRangeRect): string => {
    const lines: string[] = [];
    for (let r = range.startRow; r <= range.endRow; r++) {
      const cells: string[] = [];
      for (let c = range.startCol; c <= range.endCol; c++) {
        cells.push(grid[r][c]);
      }
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  };

  const handleCopy = (): void => {
    const range = getTargetCells();
    if (!range) return;
    navigator.clipboard.writeText(rangesToTsv(range)).catch((err) => {
      console.warn("[SpreadsheetContextMenu] copy failed", err);
    });
    cb.onClose();
  };

  const handleCut = (): void => {
    const range = getTargetCells();
    if (!range) return;
    navigator.clipboard.writeText(rangesToTsv(range)).catch((err) => {
      console.warn("[SpreadsheetContextMenu] cut copy failed", err);
    });
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        cb.setCellValue(r, c, "");
      }
    }
    cb.onClose();
  };

  const handlePaste = (): void => {
    const range = getTargetCells();
    if (!range) return;
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return;
        const lines = text.split("\n").map((line) => line.split("\t"));
        for (let r = 0; r < lines.length; r++) {
          for (let c = 0; c < lines[r].length; c++) {
            const row = range.startRow + r;
            const col = range.startCol + c;
            if (row < grid.length && col < grid[0].length) {
              cb.setCellValue(row, col, lines[r][c]);
            }
          }
        }
      })
      .catch((err) => {
        console.warn("[SpreadsheetContextMenu] paste failed", err);
      });
    cb.onClose();
  };

  const withIndexTarget = (fn: (index: number) => void) => (): void => {
    if (!indexTarget) return;
    fn(indexTarget.index);
    cb.onClose();
  };

  const handleInsertRow = (at: number, indexForRangeCheck: number): void => {
    const inData = indexForRangeCheck < dataRange.rows;
    cb.onInsertRow(at);
    if (inData) {
      adapter.replaceAll(insertRowSnapshot(adapter.getSnapshot(), at));
      cb.setDataRange({ ...dataRange, rows: dataRange.rows + 1 });
    }
  };

  const handleDeleteRow = withIndexTarget((index) => {
    const inData = index < dataRange.rows;
    cb.onDeleteRow(index);
    if (inData) {
      adapter.replaceAll(deleteRowSnapshot(adapter.getSnapshot(), index));
      cb.setDataRange({ ...dataRange, rows: Math.max(1, dataRange.rows - 1) });
    }
  });

  const handleMoveRow = (delta: -1 | 1) =>
    withIndexTarget((index) => {
      const inData = index < dataRange.rows;
      const inRange = delta === -1 ? index > 0 : index < dataRange.rows - 1;
      if (inData && inRange) {
        adapter.replaceAll(swapRowsSnapshot(adapter.getSnapshot(), index, index + delta));
      } else {
        cb.onSwapRows(index, index + delta);
      }
    });

  const handleInsertCol = (at: number, indexForRangeCheck: number): void => {
    const inData = indexForRangeCheck < dataRange.cols;
    cb.onInsertCol(at);
    if (inData) {
      adapter.replaceAll(insertColSnapshot(adapter.getSnapshot(), at));
      cb.setDataRange({ ...dataRange, cols: dataRange.cols + 1 });
    }
  };

  const handleDeleteCol = withIndexTarget((index) => {
    const inData = index < dataRange.cols;
    cb.onDeleteCol(index);
    if (inData) {
      adapter.replaceAll(deleteColSnapshot(adapter.getSnapshot(), index));
      cb.setDataRange({ ...dataRange, cols: Math.max(1, dataRange.cols - 1) });
    }
  });

  const handleMoveCol = (delta: -1 | 1) =>
    withIndexTarget((index) => {
      const inData = index < dataRange.cols;
      const inRange = delta === -1 ? index > 0 : index < dataRange.cols - 1;
      if (inData && inRange) {
        adapter.replaceAll(swapColsSnapshot(adapter.getSnapshot(), index, index + delta));
      } else {
        cb.onSwapCols(index, index + delta);
      }
    });

  const menu = openSvMenu({
    anchorPosition: { top: anchorY, left: anchorX },
    onClose: cb.onClose,
  });
  if (!menu) return null;

  const item = (
    icon: SvIconName,
    label: string,
    onClick: () => void,
    opts?: { disabled?: boolean; rotated?: boolean },
  ): HTMLButtonElement => {
    const iconEl = svIcon(icon, { fontSize: "small" });
    if (opts?.rotated) iconEl.style.transform = "rotate(-90deg)";
    return createSvMenuItem({ label, icon: iconEl, disabled: opts?.disabled, onClick });
  };

  const clipboardItems = (): Node[] => [
    item("ContentCut", t("spreadsheetCut"), handleCut),
    item("ContentCopy", t("spreadsheetCopy"), handleCopy),
    item("ContentPaste", t("spreadsheetPaste"), handlePaste),
  ];

  if (target.type === "cell") {
    menu.paper.append(...clipboardItems());
  } else if (target.type === "row") {
    const maxRowIndex = grid.length - 1;
    menu.paper.append(
      ...clipboardItems(),
      createSvDivider(),
      item("Add", t("spreadsheetInsertRowAbove"), withIndexTarget((i) => handleInsertRow(i, i))),
      item("Add", t("spreadsheetInsertRowBelow"), withIndexTarget((i) => handleInsertRow(i + 1, i))),
      item("Delete", t("spreadsheetDeleteRow"), handleDeleteRow, { disabled: target.index === 0 }),
      createSvDivider(),
      item("ArrowUpward", t("spreadsheetMoveRowUp"), handleMoveRow(-1), { disabled: target.index === 0 }),
      item("ArrowDownward", t("spreadsheetMoveRowDown"), handleMoveRow(1), {
        disabled: target.index >= maxRowIndex,
      }),
    );
  } else {
    const maxColIndex = (grid[0]?.length ?? 1) - 1;
    menu.paper.append(
      ...clipboardItems(),
      createSvDivider(),
      item("FilterList", t("spreadsheetFilterColumn"), () => {
        cb.onOpenFilter();
        cb.onClose();
      }),
      createSvDivider(),
      item("Add", t("spreadsheetInsertColLeft"), withIndexTarget((i) => handleInsertCol(i, i))),
      item("Add", t("spreadsheetInsertColRight"), withIndexTarget((i) => handleInsertCol(i + 1, i))),
      item("Delete", t("spreadsheetDeleteCol"), handleDeleteCol),
      createSvDivider(),
      item("ArrowUpward", t("spreadsheetMoveColLeft"), handleMoveCol(-1), {
        disabled: target.index === 0,
        rotated: true,
      }),
      item("ArrowDownward", t("spreadsheetMoveColRight"), handleMoveCol(1), {
        disabled: target.index >= maxColIndex,
        rotated: true,
      }),
    );
  }

  return { close: () => menu.close() };
}
