import CheckIcon from "@mui/icons-material/Check";
import FilterListIcon from "@mui/icons-material/FilterList";
import FilterListOffIcon from "@mui/icons-material/FilterListOff";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, FormLabel, IconButton,
  Radio, RadioGroup, TextField, ToggleButton, ToggleButtonGroup, Tooltip,
} from "@mui/material";
import type {
  CellAlign,
  CellEditState,
  ColumnFilterState,
  ContextMenuState,
  DataRange,
  SheetAdapter,
  SpreadsheetSelection,
} from "@anytime-markdown/spreadsheet-core";
import {
  columnLabel,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
} from "@anytime-markdown/spreadsheet-core";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SpreadsheetContextMenu } from "./SpreadsheetContextMenu";
import { getDivider } from "./styles";
import { useSpreadsheetState } from "./hooks/useSpreadsheetState";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const ROW_NUM_WIDTH = 40;
const HEADER_HEIGHT = 28;
const FILTER_ROW_HEIGHT = 28;
const RESIZE_HANDLE_THRESHOLD = 4;
const MIN_RESIZE_ROWS = 2;
const MIN_RESIZE_COLS = 1;
const AUTO_WIDTH_MIN = 60;
const AUTO_WIDTH_MAX = 300;
const AUTO_WIDTH_CHAR_PX = 8;
const AUTO_WIDTH_PADDING = 12;

interface CellSizeSettings {
  readonly heightMode: "fixed" | "auto";
  readonly fixedHeight: number;
  readonly widthMode: "fixed" | "auto";
  readonly fixedWidth: number;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SpreadsheetGridProps {
  readonly adapter: SheetAdapter;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
  /** グリッドの行数（デフォルト: 51） */
  readonly gridRows?: number;
  /** グリッドの列数（デフォルト: 15） */
  readonly gridCols?: number;
  /** 未適用の変更有無が変化したときのコールバック */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** 適用後に全画面を閉じるコールバック */
  readonly onClose?: () => void;
  /** Undo コールバック（未指定時は無効） */
  readonly onUndo?: () => void;
  /** Redo コールバック（未指定時は無効） */
  readonly onRedo?: () => void;
  /** 適用ボタンを表示するか（デフォルト: true） */
  readonly showApply?: boolean;
  /** データ範囲の青枠とリサイズハンドルを表示するか（デフォルト: true） */
  readonly showRange?: boolean;
  /** 1行目をヘッダー行（H）として表示するか（デフォルト: false） */
  readonly showHeaderRow?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Canvas click helpers (pure functions)                               */
/* ------------------------------------------------------------------ */

/** Shift+クリック時のアンカーセルを解決する */
function resolveSelectionAnchor(
  sel: SpreadsheetSelection,
): { row: number; col: number } | null {
  if (sel.type === "cell") return { row: sel.row, col: sel.col };
  if (sel.type === "range") return { row: sel.startRow, col: sel.startCol };
  return null;
}

/** ヘッダー列クリック時の選択状態を返す */
function handleHeaderColClick(
  col: number,
  shiftKey: boolean,
  selection: SpreadsheetSelection | null,
): SpreadsheetSelection {
  if (shiftKey && selection?.type === "col") {
    return { type: "col", start: selection.start, end: col };
  }
  return { type: "col", start: col, end: col };
}

/** 行番号クリック時の選択状態を返す */
function handleRowNumClick(
  row: number,
  shiftKey: boolean,
  selection: SpreadsheetSelection | null,
): SpreadsheetSelection {
  if (shiftKey && selection?.type === "row") {
    return { type: "row", start: selection.start, end: row };
  }
  return { type: "row", start: row, end: row };
}

/** セルクリック時の選択状態を返す */
function handleCellClick(
  cell: { row: number; col: number },
  shiftKey: boolean,
  selection: SpreadsheetSelection | null,
): SpreadsheetSelection {
  if (shiftKey && selection) {
    const anchor = resolveSelectionAnchor(selection);
    if (anchor) {
      return { type: "range", startRow: anchor.row, startCol: anchor.col, endRow: cell.row, endCol: cell.col };
    }
  }
  return { type: "cell", row: cell.row, col: cell.col };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SpreadsheetGrid: React.FC<Readonly<SpreadsheetGridProps>> = ({
  adapter,
  isDark,
  t,
  gridRows: GRID_ROWS = DEFAULT_GRID_ROWS,
  gridCols: GRID_COLS = DEFAULT_GRID_COLS,
  onDirtyChange,
  onClose,
  onUndo,
  onRedo,
  showApply = false,
  showRange = false,
  showHeaderRow = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);

  const readOnly = adapter.readOnly ?? false;

  // 初期データ（マウント時一度だけ）
  const initialTableData = useMemo(() => {
    const snap = adapter.getSnapshot();
    return {
      rows: Math.max(1, snap.range.rows),
      cols: Math.max(1, snap.range.cols),
      data: snap.cells.map((row) => [...row]) as string[][],
      alignments: snap.alignments.map((row) => [...row]) as CellAlign[][],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally computed once on mount
  }, []);

  const {
    grid,
    alignments,
    dataRange,
    selection,
    setCellValue,
    setDataRange,
    setSelection,
    setCellAlign,
    setAlignments,
    initGrid,
    insertRow,
    deleteRow,
    insertCol,
    deleteCol,
    swapRows,
    swapCols,
  } = useSpreadsheetState({
    initialRows: initialTableData.rows,
    initialCols: initialTableData.cols,
    initialData: initialTableData.data,
    initialAlignments: initialTableData.alignments,
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
  });

  /** 自身が adapter を更新した回数（subscribe コールバックで無視する） */
  const skipSyncCountRef = useRef(0);

  const handleDataRangeChange = useCallback(
    (newRange: DataRange) => {
      setDataRange(newRange);
    },
    [setDataRange],
  );

  /* Cell size settings */
  const [settings, setSettings] = useState<CellSizeSettings>({
    heightMode: "fixed",
    fixedHeight: DEFAULT_ROW_HEIGHT,
    widthMode: "fixed",
    fixedWidth: DEFAULT_COL_WIDTH,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<CellSizeSettings>(settings);

  const rowHeight = settings.heightMode === "fixed" ? settings.fixedHeight : DEFAULT_ROW_HEIGHT;

  const getColWidth = useCallback((col: number): number => {
    if (settings.widthMode === "fixed") return settings.fixedWidth;
    let maxWidth = AUTO_WIDTH_MIN;
    for (let r = 0; r < Math.min(dataRange.rows, GRID_ROWS); r++) {
      const text = grid[r][col];
      if (text) {
        const w = text.length * AUTO_WIDTH_CHAR_PX + AUTO_WIDTH_PADDING;
        if (w > maxWidth) maxWidth = w;
      }
    }
    return Math.min(maxWidth, AUTO_WIDTH_MAX);
  }, [settings.widthMode, settings.fixedWidth, grid, dataRange.rows, GRID_ROWS]);

  const getColX = useCallback((col: number): number => {
    let x = ROW_NUM_WIDTH;
    for (let c = 0; c < col; c++) {
      x += getColWidth(c);
    }
    return x;
  }, [getColWidth]);

  const getColAtX = useCallback((x: number): number => {
    let accX = ROW_NUM_WIDTH;
    for (let c = 0; c < GRID_COLS; c++) {
      const w = getColWidth(c);
      if (x < accX + w) return c;
      accX += w;
    }
    return GRID_COLS - 1;
  }, [getColWidth, GRID_COLS]);

  const [editing, setEditing] = useState<CellEditState | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Drag-resize state
  const [, setDragEdge] = useState<"right" | "bottom" | "corner" | null>(null);
  const [previewRange, setPreviewRange] = useState<DataRange | null>(null);
  const previewRangeRef = useRef<DataRange | null>(null);
  previewRangeRef.current = previewRange;

  // Drag reorder state (row/col)
  const [reorderDrag, setReorderDrag] = useState<{
    type: "row" | "col";
    sourceIndex: number;
    targetIndex: number | null;
  } | null>(null);
  const reorderDragRef = useRef<typeof reorderDrag>(null);
  reorderDragRef.current = reorderDrag;
  /** ドラッグ実行後のクリックを抑止するフラグ */
  const suppressClickRef = useRef(false);

  /* ---------------------------------------------------------------- */
  /*  Theme colors                                                     */
  /* ---------------------------------------------------------------- */

  const primaryColor = isDark ? "#90CAF9" : "#1976D2";
  const headerBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)";
  const selectedBg = isDark ? "rgba(144,202,249,0.16)" : "rgba(25,118,210,0.08)";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const bgColor = isDark ? "#121212" : "#FFFFFF";
  const textColor = isDark ? "rgba(255,255,255,0.87)" : "rgba(0,0,0,0.87)";
  const headerTextColor = isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.60)";

  /* ---------------------------------------------------------------- */
  /*  Column filter state                                              */
  /* ---------------------------------------------------------------- */

  const [filters, setFilters] = useState<Map<number, ColumnFilterState>>(new Map());
  const [filterRowVisible, setFilterRowVisible] = useState(false);

  const hasActiveFilters = filters.size > 0;

  /** フィルタ行の高さ（非表示時は0） */
  const filterOffset = filterRowVisible ? FILTER_ROW_HEIGHT : 0;
  /** 列ヘッダー + フィルタ行の合計高さ（セル描画の開始Y位置） */
  const topOffset = HEADER_HEIGHT + filterOffset;

  /** 各列のユニーク値（フィルタ行のプルダウン用） */
  const columnUniqueValues = useMemo(() => {
    const map = new Map<number, string[]>();
    for (let c = 0; c < dataRange.cols; c++) {
      const vals = new Set<string>();
      for (let r = 1; r < dataRange.rows; r++) {
        vals.add(grid[r][c]);
      }
      map.set(c, Array.from(vals).sort());
    }
    return map;
  }, [grid, dataRange.rows, dataRange.cols]);

  /** フィルタに基づいて非表示にする行を計算 */
  const hiddenRows = useMemo<ReadonlySet<number>>(() => {
    if (filters.size === 0) return new Set();
    const hidden = new Set<number>();
    for (let r = 1; r < GRID_ROWS; r++) {
      for (const [colIdx, filter] of filters) {
        if (!filter.selectedValues.has(grid[r][colIdx])) {
          hidden.add(r);
          break;
        }
      }
    }
    return hidden;
  }, [filters, grid, GRID_ROWS]);

  /** 表示される行インデックスの配列 */
  const visibleRows = useMemo<readonly number[]>(() => {
    if (hiddenRows.size === 0) {
      return Array.from({ length: GRID_ROWS }, (_, i) => i);
    }
    const rows: number[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!hiddenRows.has(r)) rows.push(r);
    }
    return rows;
  }, [hiddenRows, GRID_ROWS]);

  /** gridRowIndex → visibleRows内の表示位置インデックス */
  const gridRowToVisualIndex = useCallback((gridRow: number): number => {
    if (hiddenRows.size === 0) return gridRow;
    let lo = 0;
    let hi = visibleRows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (visibleRows[mid] === gridRow) return mid;
      if (visibleRows[mid] < gridRow) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }, [hiddenRows, visibleRows]);

  /** dataRange内の最後の可視行のvisibleRows内インデックス */
  const visibleDataRowCount = useMemo(() => {
    let count = 0;
    for (let r = 0; r < dataRange.rows; r++) {
      if (!hiddenRows.has(r)) count++;
    }
    return count;
  }, [dataRange.rows, hiddenRows]);

  /* ---------------------------------------------------------------- */
  /*  Canvas total size                                                */
  /* ---------------------------------------------------------------- */

  const totalWidth = useMemo(() => {
    let w = ROW_NUM_WIDTH;
    for (let c = 0; c < GRID_COLS; c++) w += getColWidth(c);
    return w;
  }, [getColWidth, GRID_COLS]);
  const totalHeight = topOffset + visibleRows.length * rowHeight;

  /* ---------------------------------------------------------------- */
  /*  drawGrid                                                         */
  /* ---------------------------------------------------------------- */

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = globalThis.devicePixelRatio || 1;

    if (canvas.width !== totalWidth * dpr || canvas.height !== totalHeight * dpr) {
      canvas.width = totalWidth * dpr;
      canvas.height = totalHeight * dpr;
      canvas.style.width = `${totalWidth}px`;
      canvas.style.height = `${totalHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;

    let startCol = 0;
    let endCol = GRID_COLS;
    {
      let accX = ROW_NUM_WIDTH;
      let foundStart = false;
      for (let c = 0; c < GRID_COLS; c++) {
        const cw = getColWidth(c);
        if (!foundStart && accX + cw > scrollLeft) {
          startCol = c;
          foundStart = true;
        }
        accX += cw;
        if (accX >= scrollLeft + viewWidth) {
          endCol = Math.min(c + 1, GRID_COLS);
          break;
        }
      }
    }
    const isStickyFirstRow = showHeaderRow && scrollTop > 0 && dataRange.rows > 0;
    const rawStartVi = Math.max(0, Math.floor((scrollTop - topOffset) / rowHeight));
    const startVi = isStickyFirstRow ? Math.max(1, rawStartVi) : rawStartVi;
    const endVi = Math.min(visibleRows.length, Math.ceil((scrollTop + viewHeight - topOffset) / rowHeight));

    ctx.save();
    ctx.clearRect(scrollLeft, scrollTop, viewWidth, viewHeight);

    ctx.fillStyle = bgColor;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, viewHeight);

    const activeRange = previewRange ?? dataRange;

    const cellAreaTop = isStickyFirstRow
      ? scrollTop + topOffset + rowHeight
      : scrollTop + topOffset;
    ctx.save();
    ctx.beginPath();
    ctx.rect(scrollLeft, cellAreaTop, viewWidth, scrollTop + viewHeight - cellAreaTop);
    ctx.clip();

    if (selection) {
      ctx.fillStyle = selectedBg;
      if (selection.type === "row") {
        const minR = Math.min(selection.start, selection.end);
        const maxR = Math.max(selection.start, selection.end);
        for (let r = minR; r <= maxR; r++) {
          const vi = gridRowToVisualIndex(r);
          if (vi < 0) continue;
          ctx.fillRect(ROW_NUM_WIDTH, topOffset + vi * rowHeight, totalWidth - ROW_NUM_WIDTH, rowHeight);
        }
      } else if (selection.type === "col") {
        const minC = Math.min(selection.start, selection.end);
        const maxC = Math.max(selection.start, selection.end);
        const x = getColX(minC);
        let w = 0;
        for (let c = minC; c <= maxC; c++) w += getColWidth(c);
        ctx.fillRect(x, topOffset, w, totalHeight - topOffset);
      } else if (selection.type === "range") {
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);
        for (let r = minR; r <= maxR; r++) {
          const vi = gridRowToVisualIndex(r);
          if (vi < 0) continue;
          const ry = topOffset + vi * rowHeight;
          for (let c = minC; c <= maxC; c++) {
            ctx.fillRect(getColX(c), ry, getColWidth(c), rowHeight);
          }
        }
      }
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();

    for (let c = startCol; c <= endCol; c++) {
      const x = getColX(c);
      ctx.moveTo(x, scrollTop);
      ctx.lineTo(x, Math.min(scrollTop + viewHeight, totalHeight));
    }
    if (scrollLeft < ROW_NUM_WIDTH) {
      ctx.moveTo(ROW_NUM_WIDTH, scrollTop);
      ctx.lineTo(ROW_NUM_WIDTH, Math.min(scrollTop + viewHeight, totalHeight));
    }

    for (let vi = startVi; vi <= endVi; vi++) {
      const y = topOffset + vi * rowHeight;
      ctx.moveTo(scrollLeft, y);
      ctx.lineTo(Math.min(scrollLeft + viewWidth, totalWidth), y);
    }
    if (scrollTop < HEADER_HEIGHT) {
      ctx.moveTo(scrollLeft, HEADER_HEIGHT);
      ctx.lineTo(Math.min(scrollLeft + viewWidth, totalWidth), HEADER_HEIGHT);
    }

    ctx.stroke();

    const activeVisibleRows = hiddenRows.size === 0
      ? activeRange.rows
      : (() => { let c = 0; for (let r = 0; r < activeRange.rows; r++) { if (!hiddenRows.has(r)) c++; } return c; })();
    const drRight = getColX(activeRange.cols);
    const drBottom = topOffset + activeVisibleRows * rowHeight;
    const drLeft = ROW_NUM_WIDTH;
    const drTop = topOffset + rowHeight;

    if (showRange) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(drLeft, drTop, drRight - drLeft, drBottom - drTop);
      ctx.stroke();
    }

    {
      const headerRowVi = showHeaderRow ? gridRowToVisualIndex(0) : -1;
      if (headerRowVi >= 0) {
        ctx.fillStyle = headerBg;
        ctx.fillRect(ROW_NUM_WIDTH, topOffset + headerRowVi * rowHeight, totalWidth - ROW_NUM_WIDTH, rowHeight);
      }
    }

    ctx.fillStyle = textColor;
    ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textBaseline = "middle";

    for (let vi = startVi; vi < endVi; vi++) {
      const r = visibleRows[vi];
      for (let c = startCol; c < endCol; c++) {
        const value = grid[r][c];
        if (!value) continue;
        if (editing?.row === r && editing?.col === c) continue;

        const cw = getColWidth(c);
        const cellLeft = getColX(c);
        const cellY = topOffset + vi * rowHeight + rowHeight / 2;
        const colAlign = alignments[r]?.[c] ?? null;

        let textX: number;
        if (colAlign === "center") {
          ctx.textAlign = "center";
          textX = cellLeft + cw / 2;
        } else if (colAlign === "right") {
          ctx.textAlign = "right";
          textX = cellLeft + cw - 6;
        } else {
          ctx.textAlign = "left";
          textX = cellLeft + 6;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellLeft, topOffset + vi * rowHeight, cw, rowHeight);
        ctx.clip();
        if (r === 0) {
          ctx.font = "600 13px -apple-system, BlinkMacSystemFont, sans-serif";
        }
        ctx.fillText(value, textX, cellY);
        if (r === 0) {
          ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
        }
        ctx.restore();
      }
    }

    ctx.restore();
    ctx.save();

    const stickyRowY = scrollTop + topOffset;
    if (isStickyFirstRow) {
      ctx.fillStyle = headerBg;
      ctx.fillRect(ROW_NUM_WIDTH, stickyRowY, totalWidth - ROW_NUM_WIDTH, rowHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scrollLeft, stickyRowY + rowHeight);
      ctx.lineTo(scrollLeft + viewWidth, stickyRowY + rowHeight);
      ctx.stroke();

      ctx.fillStyle = headerBg;
      ctx.fillRect(scrollLeft, stickyRowY, ROW_NUM_WIDTH, rowHeight);
      ctx.fillStyle = headerTextColor;
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("H", scrollLeft + ROW_NUM_WIDTH / 2, stickyRowY + rowHeight / 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, stickyRowY);
      ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, stickyRowY + rowHeight);
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = "600 13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textBaseline = "middle";
      for (let c = startCol; c < endCol; c++) {
        const value = grid[0][c];
        if (!value) continue;
        const cw = getColWidth(c);
        const cellLeft = getColX(c);
        const cellY = stickyRowY + rowHeight / 2;
        const colAlign = alignments[0]?.[c] ?? null;

        let textX: number;
        if (colAlign === "center") {
          ctx.textAlign = "center";
          textX = cellLeft + cw / 2;
        } else if (colAlign === "right") {
          ctx.textAlign = "right";
          textX = cellLeft + cw - 6;
        } else {
          ctx.textAlign = "left";
          textX = cellLeft + 6;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellLeft, stickyRowY, cw, rowHeight);
        ctx.clip();
        ctx.fillText(value, textX, cellY);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(scrollLeft, cellAreaTop, ROW_NUM_WIDTH, scrollTop + viewHeight - cellAreaTop);
    ctx.clip();

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, cellAreaTop, ROW_NUM_WIDTH, scrollTop + viewHeight - cellAreaTop);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, cellAreaTop);
    ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + viewHeight);
    ctx.stroke();

    ctx.fillStyle = headerTextColor;
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let vi = startVi; vi < endVi; vi++) {
      const r = visibleRows[vi];
      const x = scrollLeft + ROW_NUM_WIDTH / 2;
      const y = topOffset + vi * rowHeight + rowHeight / 2;

      if (selection?.type === "row" &&
          r >= Math.min(selection.start, selection.end) &&
          r <= Math.max(selection.start, selection.end)) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(scrollLeft, topOffset + vi * rowHeight, ROW_NUM_WIDTH, rowHeight);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      ctx.fillText(showHeaderRow && r === 0 ? "H" : String(showHeaderRow ? r : r + 1), x, y);
    }
    ctx.restore();

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, HEADER_HEIGHT);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(scrollLeft, scrollTop + HEADER_HEIGHT);
    ctx.lineTo(scrollLeft + viewWidth, scrollTop + HEADER_HEIGHT);
    ctx.stroke();

    ctx.fillStyle = headerTextColor;
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let c = startCol; c < endCol; c++) {
      const cw = getColWidth(c);
      const cx = getColX(c);
      const x = cx + cw / 2;
      const y = scrollTop + HEADER_HEIGHT / 2;

      if (selection?.type === "col" &&
          c >= Math.min(selection.start, selection.end) &&
          c <= Math.max(selection.start, selection.end)) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(cx, scrollTop, cw, HEADER_HEIGHT);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      ctx.fillText(columnLabel(c), x, y);
    }

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, scrollTop, ROW_NUM_WIDTH, HEADER_HEIGHT);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, scrollTop);
    ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + HEADER_HEIGHT);
    ctx.moveTo(scrollLeft, scrollTop + HEADER_HEIGHT);
    ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + HEADER_HEIGHT);
    ctx.stroke();

    if (selection?.type === "cell") {
      const selVi = gridRowToVisualIndex(selection.row);
      if (selVi >= 0) {
        const selCw = getColWidth(selection.col);
        const cellX = getColX(selection.col);
        const cellY = topOffset + selVi * rowHeight;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cellX + 1, cellY + 1, selCw - 2, rowHeight - 2);
      }
    } else if (selection?.type === "range") {
      const minR = Math.min(selection.startRow, selection.endRow);
      const maxR = Math.max(selection.startRow, selection.endRow);
      const minC = Math.min(selection.startCol, selection.endCol);
      const maxC = Math.max(selection.startCol, selection.endCol);
      const topVi = gridRowToVisualIndex(minR);
      const bottomVi = gridRowToVisualIndex(maxR);
      if (topVi >= 0 && bottomVi >= 0) {
        const rx = getColX(minC);
        const ry = topOffset + topVi * rowHeight;
        let rw = 0;
        for (let c = minC; c <= maxC; c++) rw += getColWidth(c);
        const rh = (bottomVi - topVi + 1) * rowHeight;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      }
    }

    if (showRange) {
      const handleX = drRight - 5;
      const handleY = drBottom - 5;
      ctx.fillStyle = primaryColor;
      ctx.fillRect(handleX, handleY, 10, 10);
    }

    if (reorderDrag?.targetIndex != null) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (reorderDrag.type === "row") {
        const reorderVi = gridRowToVisualIndex(reorderDrag.targetIndex);
        const indicatorY = topOffset + (reorderVi >= 0 ? reorderVi : reorderDrag.targetIndex) * rowHeight;
        ctx.moveTo(ROW_NUM_WIDTH, indicatorY);
        ctx.lineTo(totalWidth, indicatorY);
      } else {
        const indicatorX = getColX(reorderDrag.targetIndex);
        ctx.moveTo(indicatorX, topOffset);
        ctx.lineTo(indicatorX, totalHeight);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [
    alignments, bgColor, borderColor, dataRange, editing, getColWidth, getColX, grid, GRID_COLS, gridRowToVisualIndex,
    headerBg, headerTextColor, hiddenRows, previewRange, primaryColor, reorderDrag, rowHeight, selectedBg,
    selection, showHeaderRow, showRange, textColor, topOffset, totalHeight, totalWidth, visibleRows,
  ]);

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  // adapter の外部更新を購読してグリッドを再同期
  // 自身が adapter を更新した場合はスキップ（カウンターで判定）
  useEffect(() => {
    const handler = () => {
      if (skipSyncCountRef.current > 0) {
        skipSyncCountRef.current--;
        return;
      }
      const snap = adapter.getSnapshot();
      const data = snap.cells.map((r) => [...r]) as string[][];
      initGrid(data);
      setDataRange({ rows: snap.range.rows, cols: snap.range.cols });
      const fullAligns: CellAlign[][] = Array.from({ length: GRID_ROWS }, (_, r) =>
        Array.from({ length: GRID_COLS }, (_, c) => snap.alignments[r]?.[c] ?? null),
      );
      setAlignments(fullAligns);
    };
    return adapter.subscribe(handler);
  }, [adapter, initGrid, setDataRange, setAlignments, GRID_COLS, GRID_ROWS]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawGrid);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [drawGrid]);

  /* ---------------------------------------------------------------- */
  /*  Coordinate helpers                                               */
  /* ---------------------------------------------------------------- */

  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }, []);

  const getGridCoords = useCallback((e: React.MouseEvent): { row: number; col: number } | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (y < topOffset || x < ROW_NUM_WIDTH) return null;
    const col = getColAtX(x);
    const vi = Math.floor((y - topOffset) / rowHeight);
    if (vi < 0 || vi >= visibleRows.length || col < 0 || col >= GRID_COLS) return null;
    return { row: visibleRows[vi], col };
  }, [getCanvasCoords, getColAtX, rowHeight, topOffset, visibleRows, GRID_COLS]);

  const getHeaderCol = useCallback((e: React.MouseEvent): number | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (y >= HEADER_HEIGHT || x < ROW_NUM_WIDTH) return null;
    const col = getColAtX(x);
    return col >= 0 && col < GRID_COLS ? col : null;
  }, [getCanvasCoords, getColAtX, GRID_COLS]);

  const getRowNum = useCallback((e: React.MouseEvent): number | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (x >= ROW_NUM_WIDTH || y < topOffset) return null;
    const vi = Math.floor((y - topOffset) / rowHeight);
    if (vi < 0 || vi >= visibleRows.length) return null;
    return visibleRows[vi];
  }, [getCanvasCoords, rowHeight, topOffset, visibleRows]);

  /* ---------------------------------------------------------------- */
  /*  Resize edge detection                                            */
  /* ---------------------------------------------------------------- */

  const isNearRightEdge = useCallback((x: number): boolean => {
    const edgeX = getColX(dataRange.cols);
    return Math.abs(x - edgeX) < RESIZE_HANDLE_THRESHOLD;
  }, [dataRange.cols, getColX]);

  const isNearBottomEdge = useCallback((y: number): boolean => {
    const edgeY = topOffset + visibleDataRowCount * rowHeight;
    return Math.abs(y - edgeY) < RESIZE_HANDLE_THRESHOLD;
  }, [topOffset, visibleDataRowCount, rowHeight]);

  /* ---------------------------------------------------------------- */
  /*  Editing helpers                                                  */
  /* ---------------------------------------------------------------- */

  const startEditing = useCallback((row: number, col: number) => {
    if (readOnly) return;
    const value = grid[row][col];
    setEditing({ row, col, value });
    setEditValue(value);
  }, [grid, readOnly]);

  const startEditingWithChar = useCallback((row: number, col: number, char: string) => {
    if (readOnly) return;
    setCellValue(row, col, char);
    setEditing({ row, col, value: char });
    setEditValue(char);
  }, [setCellValue, readOnly]);

  const commitEditing = useCallback((value: string) => {
    if (!editing) return;
    setCellValue(editing.row, editing.col, value);
    setEditing(null);
  }, [editing, setCellValue]);

  const cancelEditing = useCallback(() => {
    setEditing(null);
  }, []);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  /* ---------------------------------------------------------------- */
  /*  Canvas mouse events                                              */
  /* ---------------------------------------------------------------- */

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const col = getHeaderCol(e);
    if (col !== null) {
      const next = handleHeaderColClick(col, e.shiftKey, selection);
      setSelection(next);
      setEditing(null);
      return;
    }

    const row = getRowNum(e);
    if (row !== null) {
      const next = handleRowNumClick(row, e.shiftKey, selection);
      setSelection(next);
      setEditing(null);
      return;
    }

    const cell = getGridCoords(e);
    if (cell) {
      const next = handleCellClick(cell, e.shiftKey, selection);
      setSelection(next);
      setEditing(null);
    }
  }, [getHeaderCol, getRowNum, getGridCoords, setSelection, selection]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    const cell = getGridCoords(e);
    if (cell) {
      startEditing(cell.row, cell.col);
    }
  }, [getGridCoords, startEditing]);

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const row = getRowNum(e);
    if (row !== null) {
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "row", index: row },
      });
      return;
    }

    const col = getHeaderCol(e);
    if (col !== null) {
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "col", index: col },
      });
      return;
    }

    const cell = getGridCoords(e);
    if (cell !== null) {
      setSelection({ type: "cell", row: cell.row, col: cell.col });
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "cell", row: cell.row, col: cell.col },
      });
    }
  }, [getRowNum, getHeaderCol, getGridCoords, setSelection]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const { x, y } = coords;

    const nearRight = showRange && isNearRightEdge(x);
    const nearBottom = showRange && isNearBottomEdge(y);

    let edge: "right" | "bottom" | "corner" | null = null;
    if (nearRight && nearBottom) edge = "corner";
    else if (nearRight && y >= topOffset && y <= topOffset + visibleDataRowCount * rowHeight) edge = "right";
    else if (nearBottom && x >= ROW_NUM_WIDTH && x <= getColX(dataRange.cols)) edge = "bottom";

    if (edge) {
      e.preventDefault();
      setDragEdge(edge);
      setPreviewRange({ ...dataRange });

      const onMouseMove = (ev: MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;

        const newCol = getColAtX(mx);
        const vi = Math.floor((my - topOffset) / rowHeight);
        const newRow = vi >= 0 && vi < visibleRows.length ? visibleRows[vi] : vi;

        const newRows = edge === "right"
          ? dataRange.rows
          : Math.max(MIN_RESIZE_ROWS, Math.min(newRow + 1, GRID_ROWS));
        const newCols = edge === "bottom"
          ? dataRange.cols
          : Math.max(MIN_RESIZE_COLS, Math.min(newCol + 1, GRID_COLS));

        const nr: DataRange = { rows: newRows, cols: newCols };
        setPreviewRange(nr);
        previewRangeRef.current = nr;
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        const final = previewRangeRef.current;
        if (final) {
          handleDataRangeChange(final);
        }
        setDragEdge(null);
        setPreviewRange(null);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      return;
    }

    const DRAG_THRESHOLD = 5;

    if (x < ROW_NUM_WIDTH && y >= topOffset) {
      const srcVi = Math.floor((y - topOffset) / rowHeight);
      const srcRow = srcVi >= 0 && srcVi < visibleRows.length ? visibleRows[srcVi] : -1;
      if (srcRow >= 0 && srcRow < GRID_ROWS) {
        const startY = e.clientY;
        let dragStarted = false;

        const onMouseMove = (ev: MouseEvent) => {
          if (!dragStarted && Math.abs(ev.clientY - startY) >= DRAG_THRESHOLD) {
            dragStarted = true;
            setReorderDrag({ type: "row", sourceIndex: srcRow, targetIndex: null });
          }
          if (dragStarted) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const my = ev.clientY - rect.top;
            const targetVi = Math.max(0, Math.min(visibleRows.length, Math.floor((my - topOffset) / rowHeight)));
            const targetRow = targetVi < visibleRows.length ? visibleRows[targetVi] : GRID_ROWS;
            setReorderDrag((prev) => prev ? { ...prev, targetIndex: targetRow } : null);
          }
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          if (dragStarted) {
            const drag = reorderDragRef.current;
            if (drag?.targetIndex != null && drag.targetIndex !== drag.sourceIndex) {
              const from = drag.sourceIndex;
              const to = drag.targetIndex > from ? drag.targetIndex - 1 : drag.targetIndex;
              if (from !== to) {
                swapRows(from, to);
                setSelection({ type: "row", start: to, end: to });
              }
            }
            setReorderDrag(null);
            suppressClickRef.current = true;
          }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return;
      }
    }

    if (y < topOffset && x >= ROW_NUM_WIDTH) {
      const srcCol = getColAtX(x);
      if (srcCol >= 0 && srcCol < GRID_COLS) {
        const startX = e.clientX;
        let dragStarted = false;

        const onMouseMove = (ev: MouseEvent) => {
          if (!dragStarted && Math.abs(ev.clientX - startX) >= DRAG_THRESHOLD) {
            dragStarted = true;
            setReorderDrag({ type: "col", sourceIndex: srcCol, targetIndex: null });
          }
          if (dragStarted) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = ev.clientX - rect.left;
            const targetCol = Math.max(0, Math.min(GRID_COLS, getColAtX(mx)));
            setReorderDrag((prev) => prev ? { ...prev, targetIndex: targetCol } : null);
          }
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          if (dragStarted) {
            const drag = reorderDragRef.current;
            if (drag?.targetIndex != null && drag.targetIndex !== drag.sourceIndex) {
              const from = drag.sourceIndex;
              const to = drag.targetIndex > from ? drag.targetIndex - 1 : drag.targetIndex;
              if (from !== to) {
                swapCols(from, to);
                setSelection({ type: "col", start: to, end: to });
              }
            }
            setReorderDrag(null);
            suppressClickRef.current = true;
          }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return;
      }
    }

    if (y >= topOffset && x >= ROW_NUM_WIDTH) {
      const vi = Math.floor((y - topOffset) / rowHeight);
      const startRow = vi >= 0 && vi < visibleRows.length ? visibleRows[vi] : -1;
      const startCol = getColAtX(x);
      if (startRow >= 0 && startCol >= 0) {
        let dragStarted = false;
        const DRAG_THRESHOLD_INNER = 3;

        const onMouseMove = (ev: MouseEvent) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const my = ev.clientY - rect.top;
          if (!dragStarted && (Math.abs(mx - x) >= DRAG_THRESHOLD_INNER || Math.abs(my - y) >= DRAG_THRESHOLD_INNER)) {
            dragStarted = true;
          }
          if (dragStarted) {
            const endVi = Math.max(0, Math.min(visibleRows.length - 1, Math.floor((my - topOffset) / rowHeight)));
            const endRow = visibleRows[endVi];
            const endCol = Math.max(0, Math.min(GRID_COLS - 1, getColAtX(mx)));
            setSelection({ type: "range", startRow, startCol, endRow, endCol });
          }
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          if (dragStarted) {
            suppressClickRef.current = true;
          }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }
    }
  }, [
    getCanvasCoords, getColAtX, getColX, isNearRightEdge, isNearBottomEdge, dataRange, rowHeight, topOffset,
    handleDataRangeChange, setSelection, swapRows, swapCols, visibleRows, visibleDataRowCount,
    GRID_COLS, GRID_ROWS,
  ]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const { x, y } = coords;

    const nearRight = showRange && isNearRightEdge(x);
    const nearBottom = showRange && isNearBottomEdge(y);

    if (nearRight && nearBottom) {
      canvas.style.cursor = "nwse-resize";
    } else if (nearRight && y >= topOffset && y <= topOffset + dataRange.rows * rowHeight) {
      canvas.style.cursor = "col-resize";
    } else if (nearBottom && x >= ROW_NUM_WIDTH && x <= getColX(dataRange.cols)) {
      canvas.style.cursor = "row-resize";
    } else if (y < topOffset && x >= ROW_NUM_WIDTH) {
      canvas.style.cursor = "grab";
    } else if (x < ROW_NUM_WIDTH && y >= topOffset) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "cell";
    }
  }, [getCanvasCoords, getColX, isNearRightEdge, isNearBottomEdge, dataRange, rowHeight, topOffset]);

  /* ---------------------------------------------------------------- */
  /*  Canvas keyboard events                                           */
  /* ---------------------------------------------------------------- */

  const handleKeyNavigation = useCallback(
    (key: string, shiftKey: boolean) => {
      if (!selection) return;

      const getSelectionRow = (): number => {
        if (selection.type === "cell") return selection.row;
        if (selection.type === "range") return selection.startRow;
        if (selection.type === "row") return selection.start;
        return 0;
      };
      const getSelectionCol = (): number => {
        if (selection.type === "cell") return selection.col;
        if (selection.type === "range") return selection.startCol;
        if (selection.type === "col") return selection.start;
        return 0;
      };
      let row = getSelectionRow();
      let col = getSelectionCol();

      switch (key) {
        case "ArrowUp":
          row = Math.max(0, row - 1);
          break;
        case "ArrowDown":
        case "Enter":
          row = Math.min(GRID_ROWS - 1, row + 1);
          break;
        case "ArrowLeft":
          col = Math.max(0, col - 1);
          break;
        case "ArrowRight":
          col = Math.min(GRID_COLS - 1, col + 1);
          break;
        case "Tab":
          if (shiftKey) {
            col = Math.max(0, col - 1);
          } else {
            col = Math.min(GRID_COLS - 1, col + 1);
          }
          break;
        default:
          return;
      }

      setSelection({ type: "cell", row, col });
      setEditing(null);
    },
    [selection, setSelection, GRID_COLS, GRID_ROWS],
  );

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) return;

    const { key, shiftKey, ctrlKey, metaKey, altKey } = e;

    // Undo/Redo を外部に転送
    if ((ctrlKey || metaKey) && key === "z") {
      e.preventDefault();
      if (shiftKey) {
        onRedo?.();
      } else {
        onUndo?.();
      }
      return;
    }
    if ((ctrlKey || metaKey) && key === "y") {
      e.preventDefault();
      onRedo?.();
      return;
    }

    if ((ctrlKey || metaKey) && selection && (selection.type === "cell" || selection.type === "range")) {
      const anchor = selection.type === "cell"
        ? { minR: selection.row, minC: selection.col, maxR: selection.row, maxC: selection.col }
        : { minR: Math.min(selection.startRow, selection.endRow), minC: Math.min(selection.startCol, selection.endCol),
            maxR: Math.max(selection.startRow, selection.endRow), maxC: Math.max(selection.startCol, selection.endCol) };

      if (key === "c" || key === "x") {
        e.preventDefault();
        const lines: string[] = [];
        for (let r = anchor.minR; r <= anchor.maxR; r++) {
          const cells: string[] = [];
          for (let c = anchor.minC; c <= anchor.maxC; c++) cells.push(grid[r][c]);
          lines.push(cells.join("\t"));
        }
        navigator.clipboard.writeText(lines.join("\n")).catch((err) => {
          console.warn("[SpreadsheetGrid] clipboard write failed", err);
        });
        if (key === "x" && !readOnly) {
          for (let r = anchor.minR; r <= anchor.maxR; r++) {
            for (let c = anchor.minC; c <= anchor.maxC; c++) {
              setCellValue(r, c, "");
            }
          }
        }
        return;
      }
      if (key === "v") {
        if (readOnly) return;
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (!text) return;
          const lines = text.split("\n").map((line) => line.split("\t"));
          for (let r = 0; r < lines.length; r++) {
            for (let c = 0; c < lines[r].length; c++) {
              const targetRow = anchor.minR + r;
              const targetCol = anchor.minC + c;
              if (targetRow < grid.length && targetCol < grid[0].length) {
                setCellValue(targetRow, targetCol, lines[r][c]);
              }
            }
          }
        }).catch((err) => {
          console.warn("[SpreadsheetGrid] clipboard read failed", err);
        });
        return;
      }
    }

    if (
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "Tab"
    ) {
      e.preventDefault();
      handleKeyNavigation(key, shiftKey);
      return;
    }

    if (key === "Enter" || key === "F2") {
      e.preventDefault();
      if (selection?.type === "cell") {
        startEditing(selection.row, selection.col);
      }
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      if (readOnly) return;
      e.preventDefault();
      if (selection?.type === "cell") {
        setCellValue(selection.row, selection.col, "");
      } else if (selection?.type === "range") {
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            setCellValue(r, c, "");
          }
        }
      }
      return;
    }

    if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
      e.preventDefault();
      if (selection?.type === "cell") {
        startEditingWithChar(selection.row, selection.col, key);
      }
    }
  }, [
    editing, grid, selection, handleKeyNavigation, startEditing,
    startEditingWithChar, setCellValue, onUndo, onRedo, readOnly,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Input (editing mode) events                                      */
  /* ---------------------------------------------------------------- */

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const { key, shiftKey } = e;

    if (key === "Enter") {
      e.preventDefault();
      commitEditing(editValue);
      handleKeyNavigation("Enter", false);
      return;
    }

    if (key === "Tab") {
      e.preventDefault();
      commitEditing(editValue);
      handleKeyNavigation("Tab", shiftKey);
      return;
    }

    if (key === "Escape") {
      e.preventDefault();
      cancelEditing();
      canvasRef.current?.focus();
    }
  }, [editValue, commitEditing, cancelEditing, handleKeyNavigation]);

  const handleInputBlur = useCallback(() => {
    if (editing) {
      commitEditing(editValue);
    }
  }, [editing, editValue, commitEditing]);

  /* ---------------------------------------------------------------- */
  /*  Context menu close                                               */
  /* ---------------------------------------------------------------- */

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Input overlay style                                              */
  /* ---------------------------------------------------------------- */

  const inputStyle: React.CSSProperties = editing ? {
    position: "absolute",
    left: getColX(editing.col),
    top: topOffset + gridRowToVisualIndex(editing.row) * rowHeight,
    width: getColWidth(editing.col),
    height: rowHeight,
    border: `2px solid ${primaryColor}`,
    padding: "0 6px",
    fontSize: 13,
    fontFamily: "inherit",
    background: bgColor,
    color: textColor,
    outline: "none",
    boxSizing: "border-box",
    zIndex: 1,
  } : { display: "none" };

  /* ---------------------------------------------------------------- */
  /*  Alignment handler                                                */
  /* ---------------------------------------------------------------- */

  const handleAlignChange = useCallback(
    (_e: React.MouseEvent, val: string | null) => {
      if (!val || !selection || readOnly) return;
      const align = val as CellAlign;

      const newAligns = alignments.map((r) => [...r]);

      if (selection.type === "cell") {
        newAligns[selection.row][selection.col] = align;
        setCellAlign(selection.row, selection.col, align);
      } else if (selection.type === "col") {
        const minC = Math.min(selection.start, selection.end);
        const maxC = Math.max(selection.start, selection.end);
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = minC; c <= maxC; c++) {
            newAligns[r][c] = align;
          }
        }
        setAlignments(newAligns);
      } else if (selection.type === "row") {
        const minR = Math.min(selection.start, selection.end);
        const maxR = Math.max(selection.start, selection.end);
        for (let r = minR; r <= maxR; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            newAligns[r][c] = align;
          }
        }
        setAlignments(newAligns);
      }

    },
    [selection, setCellAlign, setAlignments, alignments, GRID_COLS, GRID_ROWS, readOnly],
  );

  /** 未適用の変更追跡 */
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
      onDirtyChange?.(true);
    }
  }, [grid, alignments, dataRange, onDirtyChange]);

  /** 適用ボタン: グリッド全体を adapter に一括反映 */
  const handleApply = useCallback(() => {
    if (readOnly) return;
    const cells: string[][] = [];
    const aligns: CellAlign[][] = [];
    for (let r = 0; r < dataRange.rows; r++) {
      const row: string[] = [];
      const alignRow: CellAlign[] = [];
      for (let c = 0; c < dataRange.cols; c++) {
        row.push(grid[r]?.[c] ?? "");
        alignRow.push(alignments[r]?.[c] ?? null);
      }
      cells.push(row);
      aligns.push(alignRow);
    }
    skipSyncCountRef.current++;
    adapter.replaceAll({ cells, alignments: aligns, range: dataRange });
    dirtyRef.current = false;
    setDirty(false);
    onDirtyChange?.(false);
    onClose?.();
  }, [adapter, grid, dataRange, alignments, onDirtyChange, onClose, readOnly]);

  const iconSx = { fontSize: 16 };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark), px: 1, py: 0.25, gap: 0.5, flexShrink: 0 }}>
        <ToggleButtonGroup exclusive size="small" sx={{ height: 24 }} onChange={handleAlignChange} disabled={readOnly}>
          <ToggleButton value="left" aria-label={t("alignLeft")} sx={{ px: 0.5, py: 0.125 }}>
            <Tooltip title={t("alignLeft")} placement="top"><FormatAlignLeftIcon sx={iconSx} /></Tooltip>
          </ToggleButton>
          <ToggleButton value="center" aria-label={t("alignCenter")} sx={{ px: 0.5, py: 0.125 }}>
            <Tooltip title={t("alignCenter")} placement="top"><FormatAlignCenterIcon sx={iconSx} /></Tooltip>
          </ToggleButton>
          <ToggleButton value="right" aria-label={t("alignRight")} sx={{ px: 0.5, py: 0.125 }}>
            <Tooltip title={t("alignRight")} placement="top"><FormatAlignRightIcon sx={iconSx} /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title={t("spreadsheetFilter")} placement="top">
          <IconButton
            size="small"
            onClick={() => setFilterRowVisible((prev) => !prev)}
            sx={{ ml: 0.5, color: (filterRowVisible || hasActiveFilters) ? "primary.main" : undefined }}
          >
            <FilterListIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        {hasActiveFilters && (
          <Tooltip title={t("spreadsheetFilterClear")} placement="top">
            <IconButton size="small" onClick={() => { setFilters(new Map()); setFilterRowVisible(false); }} sx={{ ml: 0.25 }}>
              <FilterListOffIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={t("spreadsheetCellSettings")} placement="top">
          <IconButton size="small" onClick={() => { setSettingsDraft(settings); setSettingsOpen(true); }} sx={{ ml: 0.5 }}>
            <SettingsIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        {showApply && (
          <Tooltip title={t("spreadsheetApply")} placement="top">
            <Button
              size="small"
              variant={dirty ? "contained" : "outlined"}
              color={dirty ? "primary" : "inherit"}
              startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
              onClick={handleApply}
              disabled={readOnly}
              sx={{ textTransform: "none", fontSize: 12, height: 24, px: 1.5 }}
            >
              {t("spreadsheetApply")}
            </Button>
          </Tooltip>
        )}
      </Box>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("spreadsheetCellSettings")}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <FormControl>
            <FormLabel>{t("spreadsheetHeightMode")}</FormLabel>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <RadioGroup
                row
                value={settingsDraft.heightMode}
                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, heightMode: e.target.value as "fixed" | "auto" }))}
              >
                <FormControlLabel value="fixed" control={<Radio size="small" />} label={t("spreadsheetFixed")} />
                <FormControlLabel value="auto" control={<Radio size="small" />} label={t("spreadsheetAuto")} />
              </RadioGroup>
              <TextField
                type="number"
                size="small"
                value={settingsDraft.fixedHeight}
                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, fixedHeight: Math.max(20, Number.parseInt(e.target.value, 10) || 20) }))}
                disabled={settingsDraft.heightMode === "auto"}
                slotProps={{ htmlInput: { min: 20, max: 200 } }}
                sx={{ width: 80 }}
              />
              <span>px</span>
            </Box>
          </FormControl>
          <FormControl>
            <FormLabel>{t("spreadsheetWidthMode")}</FormLabel>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <RadioGroup
                row
                value={settingsDraft.widthMode}
                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, widthMode: e.target.value as "fixed" | "auto" }))}
              >
                <FormControlLabel value="fixed" control={<Radio size="small" />} label={t("spreadsheetFixed")} />
                <FormControlLabel value="auto" control={<Radio size="small" />} label={t("spreadsheetAuto")} />
              </RadioGroup>
              <TextField
                type="number"
                size="small"
                value={settingsDraft.fixedWidth}
                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, fixedWidth: Math.max(40, Number.parseInt(e.target.value, 10) || 40) }))}
                disabled={settingsDraft.widthMode === "auto"}
                slotProps={{ htmlInput: { min: 40, max: 500 } }}
                sx={{ width: 80 }}
              />
              <span>px</span>
            </Box>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>{t("spreadsheetCancel")}</Button>
          <Button variant="contained" onClick={() => { setSettings(settingsDraft); setSettingsOpen(false); }}>{t("spreadsheetApply")}</Button>
        </DialogActions>
      </Dialog>

      <Box
        ref={containerRef}
        onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }}
        sx={{
          overflow: "auto",
          flex: 1,
          position: "relative",
          fontSize: 13,
          lineHeight: "24px",
          scrollbarWidth: "thin",
          scrollbarColor: isDark ? "rgba(255,255,255,0.45) transparent" : "rgba(0,0,0,0.4) transparent",
          "&::-webkit-scrollbar": { width: 6, height: 6 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
            borderRadius: 3,
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
          },
        }}
      >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={handleCanvasContextMenu}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onKeyDown={handleCanvasKeyDown}
        style={{ display: "block", outline: "none" }}
      />

      {filterRowVisible && (
        <Box
          style={{
            position: "absolute",
            top: HEADER_HEIGHT,
            left: 0,
            display: "flex",
            height: FILTER_ROW_HEIGHT,
            zIndex: 2,
            pointerEvents: "auto",
            width: totalWidth,
          }}
        >
          <Box sx={{ minWidth: ROW_NUM_WIDTH, flexShrink: 0, background: bgColor }} />
          {Array.from({ length: dataRange.cols }, (_, c) => {
            const uniqueVals = columnUniqueValues.get(c) ?? [];
            const currentFilter = filters.get(c);
            const hasSingleFilter = currentFilter?.selectedValues?.size === 1;
            const selectedValue = hasSingleFilter
              ? Array.from(currentFilter!.selectedValues!)[0]
              : "__all__";
            return (
              <Box key={c} sx={{ minWidth: getColWidth(c), maxWidth: getColWidth(c), flexShrink: 0, px: 0.25, background: bgColor }}>
                <select
                  value={selectedValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilters((prev) => {
                      const next = new Map(prev);
                      if (val === "__all__") {
                        next.delete(c);
                      } else {
                        next.set(c, { colIndex: c, selectedValues: new Set([val]) });
                      }
                      return next;
                    });
                  }}
                  style={{
                    width: "100%",
                    height: 24,
                    fontSize: 11,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 2,
                    background: bgColor,
                    color: textColor,
                    outline: "none",
                    padding: "0 2px",
                  }}
                >
                  <option value="__all__">{t("spreadsheetFilterSelectAll")}</option>
                  {uniqueVals.map((v) => (
                    <option key={v} value={v}>{v || "(empty)"}</option>
                  ))}
                </select>
              </Box>
            );
          })}
        </Box>
      )}

      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleInputKeyDown}
        onBlur={handleInputBlur}
        readOnly={readOnly}
        style={inputStyle}
      />

      {contextMenu !== null && (
        <SpreadsheetContextMenu
          adapter={adapter}
          contextMenu={contextMenu}
          dataRange={dataRange}
          grid={grid}
          onClose={handleContextMenuClose}
          onInsertRow={insertRow}
          onDeleteRow={deleteRow}
          onInsertCol={insertCol}
          onDeleteCol={deleteCol}
          onSwapRows={swapRows}
          onSwapCols={swapCols}
          setDataRange={setDataRange}
          setCellValue={setCellValue}
          onOpenFilter={() => setFilterRowVisible(true)}
          isDark={isDark}
          t={t}
        />
      )}
    </Box>
    </Box>
  );
};
