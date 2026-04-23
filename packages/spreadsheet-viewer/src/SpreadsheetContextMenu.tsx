import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import DeleteIcon from "@mui/icons-material/Delete";
import FilterListIcon from "@mui/icons-material/FilterList";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type {
  CellAlign,
  ContextMenuState,
  DataRange,
  SheetAdapter,
  SheetSnapshot,
} from "@anytime-markdown/spreadsheet-core";
import React, { useCallback } from "react";

interface SpreadsheetContextMenuProps {
  readonly adapter: SheetAdapter;
  readonly contextMenu: ContextMenuState;
  readonly dataRange: DataRange;
  readonly grid: string[][];
  readonly onClose: () => void;
  readonly onInsertRow: (index: number) => void;
  readonly onDeleteRow: (index: number) => void;
  readonly onInsertCol: (index: number) => void;
  readonly onDeleteCol: (index: number) => void;
  readonly onSwapRows: (a: number, b: number) => void;
  readonly onSwapCols: (a: number, b: number) => void;
  readonly setDataRange: (range: DataRange) => void;
  readonly setCellValue: (row: number, col: number, value: string) => void;
  readonly onOpenFilter: () => void;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Snapshot builders（pure functions）                                 */
/* ------------------------------------------------------------------ */

function makeEmptyRow(cols: number): string[] {
  return Array.from({ length: cols }, () => "");
}

function makeEmptyAlignRow(cols: number): CellAlign[] {
  return Array.from<CellAlign>({ length: cols }).fill(null);
}

function insertRowSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
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

function deleteRowSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
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

function insertColSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
  const cells = snapshot.cells.map((row) => {
    const next = [...row];
    next.splice(at, 0, "");
    return next;
  });
  const alignments = snapshot.alignments.map((row) => {
    const next = [...row];
    next.splice(at, 0, null);
    return next;
  });
  return {
    cells,
    alignments,
    range: { rows: snapshot.range.rows, cols: snapshot.range.cols + 1 },
  };
}

function deleteColSnapshot(snapshot: SheetSnapshot, at: number): SheetSnapshot {
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

function swapRowsSnapshot(snapshot: SheetSnapshot, a: number, b: number): SheetSnapshot {
  const cells = snapshot.cells.map((r) => [...r]);
  const alignments = snapshot.alignments.map((r) => [...r]);
  [cells[a], cells[b]] = [cells[b], cells[a]];
  [alignments[a], alignments[b]] = [alignments[b], alignments[a]];
  return { cells, alignments, range: snapshot.range };
}

function swapColsSnapshot(snapshot: SheetSnapshot, a: number, b: number): SheetSnapshot {
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
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export const SpreadsheetContextMenu = React.memo(
  function SpreadsheetContextMenu({
    adapter,
    contextMenu,
    dataRange,
    grid,
    onClose,
    onInsertRow,
    onDeleteRow,
    onInsertCol,
    onDeleteCol,
    onSwapRows,
    onSwapCols,
    setDataRange,
    setCellValue,
    onOpenFilter,
    isDark: _isDark,
    t,
  }: Readonly<SpreadsheetContextMenuProps>) {
    const { anchorX, anchorY, target } = contextMenu;
    const indexTarget = target.type !== "cell" ? target : null;

    const handleInsertRowAbove = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      onInsertRow(indexTarget.index);
      if (inData) {
        adapter.replaceAll(insertRowSnapshot(adapter.getSnapshot(), indexTarget.index));
        setDataRange({ ...dataRange, rows: dataRange.rows + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onInsertRow, setDataRange, onClose]);

    const handleInsertRowBelow = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      onInsertRow(indexTarget.index + 1);
      if (inData) {
        adapter.replaceAll(insertRowSnapshot(adapter.getSnapshot(), indexTarget.index + 1));
        setDataRange({ ...dataRange, rows: dataRange.rows + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onInsertRow, setDataRange, onClose]);

    const handleDeleteRow = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      onDeleteRow(indexTarget.index);
      if (inData) {
        adapter.replaceAll(deleteRowSnapshot(adapter.getSnapshot(), indexTarget.index));
        setDataRange({
          ...dataRange,
          rows: Math.max(1, dataRange.rows - 1),
        });
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onDeleteRow, setDataRange, onClose]);

    const handleMoveRowUp = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      if (inData && indexTarget.index > 0) {
        adapter.replaceAll(swapRowsSnapshot(adapter.getSnapshot(), indexTarget.index, indexTarget.index - 1));
      } else {
        onSwapRows(indexTarget.index, indexTarget.index - 1);
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onSwapRows, onClose]);

    const handleMoveRowDown = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      if (inData && indexTarget.index < dataRange.rows - 1) {
        adapter.replaceAll(swapRowsSnapshot(adapter.getSnapshot(), indexTarget.index, indexTarget.index + 1));
      } else {
        onSwapRows(indexTarget.index, indexTarget.index + 1);
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onSwapRows, onClose]);

    const handleInsertColLeft = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      onInsertCol(indexTarget.index);
      if (inData) {
        adapter.replaceAll(insertColSnapshot(adapter.getSnapshot(), indexTarget.index));
        setDataRange({ ...dataRange, cols: dataRange.cols + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onInsertCol, setDataRange, onClose]);

    const handleInsertColRight = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      onInsertCol(indexTarget.index + 1);
      if (inData) {
        adapter.replaceAll(insertColSnapshot(adapter.getSnapshot(), indexTarget.index + 1));
        setDataRange({ ...dataRange, cols: dataRange.cols + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onInsertCol, setDataRange, onClose]);

    const handleDeleteCol = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      onDeleteCol(indexTarget.index);
      if (inData) {
        adapter.replaceAll(deleteColSnapshot(adapter.getSnapshot(), indexTarget.index));
        setDataRange({
          ...dataRange,
          cols: Math.max(1, dataRange.cols - 1),
        });
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onDeleteCol, setDataRange, onClose]);

    const handleMoveColLeft = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      if (inData && indexTarget.index > 0) {
        adapter.replaceAll(swapColsSnapshot(adapter.getSnapshot(), indexTarget.index, indexTarget.index - 1));
      } else {
        onSwapCols(indexTarget.index, indexTarget.index - 1);
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onSwapCols, onClose]);

    const handleMoveColRight = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      if (inData && indexTarget.index < dataRange.cols - 1) {
        adapter.replaceAll(swapColsSnapshot(adapter.getSnapshot(), indexTarget.index, indexTarget.index + 1));
      } else {
        onSwapCols(indexTarget.index, indexTarget.index + 1);
      }
      onClose();
    }, [indexTarget, dataRange, adapter, onSwapCols, onClose]);

    /** コピー対象のセル範囲を target の種類に応じて返す */
    const getTargetCells = useCallback((): { startRow: number; startCol: number; endRow: number; endCol: number } | null => {
      if (target.type === "cell") {
        return { startRow: target.row, startCol: target.col, endRow: target.row, endCol: target.col };
      }
      if (target.type === "row") {
        const cols = grid[0]?.length ?? 0;
        return cols > 0 ? { startRow: target.index, startCol: 0, endRow: target.index, endCol: cols - 1 } : null;
      }
      if (target.type === "col") {
        const rows = grid.length;
        return rows > 0 ? { startRow: 0, startCol: target.index, endRow: rows - 1, endCol: target.index } : null;
      }
      return null;
    }, [target, grid]);

    /** セル範囲をTSV文字列に変換 */
    const rangesToTsv = useCallback((range: { startRow: number; startCol: number; endRow: number; endCol: number }): string => {
      const lines: string[] = [];
      for (let r = range.startRow; r <= range.endRow; r++) {
        const cells: string[] = [];
        for (let c = range.startCol; c <= range.endCol; c++) {
          cells.push(grid[r][c]);
        }
        lines.push(cells.join("\t"));
      }
      return lines.join("\n");
    }, [grid]);

    const handleCopy = useCallback(() => {
      const range = getTargetCells();
      if (!range) return;
      navigator.clipboard.writeText(rangesToTsv(range)).catch((err) => {
        console.warn("[SpreadsheetContextMenu] copy failed", err);
      });
      onClose();
    }, [getTargetCells, rangesToTsv, onClose]);

    const handleCut = useCallback(() => {
      const range = getTargetCells();
      if (!range) return;
      navigator.clipboard.writeText(rangesToTsv(range)).catch((err) => {
        console.warn("[SpreadsheetContextMenu] cut copy failed", err);
      });
      for (let r = range.startRow; r <= range.endRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          setCellValue(r, c, "");
        }
      }
      onClose();
    }, [getTargetCells, rangesToTsv, setCellValue, onClose]);

    const handlePaste = useCallback(() => {
      const range = getTargetCells();
      if (!range) return;
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        const lines = text.split("\n").map((line) => line.split("\t"));
        for (let r = 0; r < lines.length; r++) {
          for (let c = 0; c < lines[r].length; c++) {
            const row = range.startRow + r;
            const col = range.startCol + c;
            if (row < grid.length && col < grid[0].length) {
              setCellValue(row, col, lines[r][c]);
            }
          }
        }
      }).catch((err) => {
        console.warn("[SpreadsheetContextMenu] paste failed", err);
      });
      onClose();
    }, [getTargetCells, grid, setCellValue, onClose]);

    const rotatedIconSx = { transform: "rotate(-90deg)" } as const;

    if (target.type === "cell") {
      return (
        <Menu
          open
          onClose={onClose}
          anchorReference="anchorPosition"
          anchorPosition={{ top: anchorY, left: anchorX }}
        >
          <MenuItem onClick={handleCut}>
            <ListItemIcon>
              <ContentCutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetCut")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleCopy}>
            <ListItemIcon>
              <ContentCopyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetCopy")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handlePaste}>
            <ListItemIcon>
              <ContentPasteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetPaste")}</ListItemText>
          </MenuItem>
        </Menu>
      );
    }

    if (target.type === "row") {
      const maxRowIndex = grid.length - 1;
      return (
        <Menu
          open
          onClose={onClose}
          anchorReference="anchorPosition"
          anchorPosition={{ top: anchorY, left: anchorX }}
        >
          <MenuItem onClick={handleCut}>
            <ListItemIcon>
              <ContentCutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetCut")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleCopy}>
            <ListItemIcon>
              <ContentCopyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetCopy")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handlePaste}>
            <ListItemIcon>
              <ContentPasteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetPaste")}</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleInsertRowAbove}>
            <ListItemIcon>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetInsertRowAbove")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleInsertRowBelow}>
            <ListItemIcon>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetInsertRowBelow")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleDeleteRow} disabled={target.index === 0}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetDeleteRow")}</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={handleMoveRowUp}
            disabled={target.index === 0}
          >
            <ListItemIcon>
              <ArrowUpwardIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetMoveRowUp")}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={handleMoveRowDown}
            disabled={target.index >= maxRowIndex}
          >
            <ListItemIcon>
              <ArrowDownwardIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("spreadsheetMoveRowDown")}</ListItemText>
          </MenuItem>
        </Menu>
      );
    }

    // target.type === "col"
    const maxColIndex = (grid[0]?.length ?? 1) - 1;
    return (
      <Menu
        open
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={{ top: anchorY, left: anchorX }}
      >
        <MenuItem onClick={handleCut}>
          <ListItemIcon>
            <ContentCutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetCut")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleCopy}>
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetCopy")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handlePaste}>
          <ListItemIcon>
            <ContentPasteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetPaste")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { onOpenFilter(); onClose(); }}>
          <ListItemIcon>
            <FilterListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetFilterColumn")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleInsertColLeft}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetInsertColLeft")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleInsertColRight}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetInsertColRight")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDeleteCol}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetDeleteCol")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={handleMoveColLeft}
          disabled={target.index === 0}
        >
          <ListItemIcon>
            <ArrowUpwardIcon fontSize="small" sx={rotatedIconSx} />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetMoveColLeft")}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={handleMoveColRight}
          disabled={target.index >= maxColIndex}
        >
          <ListItemIcon>
            <ArrowDownwardIcon fontSize="small" sx={rotatedIconSx} />
          </ListItemIcon>
          <ListItemText>{t("spreadsheetMoveColRight")}</ListItemText>
        </MenuItem>
      </Menu>
    );
  },
);
