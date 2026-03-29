import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, FormLabel, IconButton,
  Radio, RadioGroup, TextField, ToggleButton, ToggleButtonGroup, Tooltip,
} from "@mui/material";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDivider } from "../../constants/colors";
import type { CellAlign, CellEditState, ContextMenuState, DataRange } from "./spreadsheetTypes";
import { SpreadsheetContextMenu } from "./SpreadsheetContextMenu";
import { useSpreadsheetState } from "./useSpreadsheetState";
import { useSpreadsheetSync, extractTableData } from "./useSpreadsheetSync";
import {
  columnLabel,
  GRID_COLS,
  GRID_ROWS,
  isInDataRange,
} from "./spreadsheetUtils";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const ROW_NUM_WIDTH = 40;
const HEADER_HEIGHT = 28;
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
  readonly editor: Editor;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SpreadsheetGrid: React.FC<Readonly<SpreadsheetGridProps>> = ({
  editor,
  isDark,
  t,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialTableData = useMemo(() => {
    let tableNode: PMNode | null = null;
    editor.state.doc.descendants((node) => {
      if (tableNode) return false;
      if (node.type.name === "table") { tableNode = node; return false; }
    });
    if (!tableNode) return { rows: 1, cols: 1, data: [] as string[][], alignments: [] as (import("./spreadsheetTypes").CellAlign)[][] };
    const { data, range, alignments } = extractTableData(tableNode);
    return { rows: range.rows, cols: range.cols, data, alignments };
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
  });

  const { syncCellToProseMirror: rawSyncCell, rebuildTable: rawRebuildTable } = useSpreadsheetSync({ editor });
  /** スプレッドシート自身が ProseMirror を更新した回数（update イベントでデクリメント） */
  const skipSyncCountRef = useRef(0);

  const syncCellToProseMirror = useCallback(
    (row: number, col: number, value: string) => {
      skipSyncCountRef.current++;
      rawSyncCell(row, col, value);
    },
    [rawSyncCell],
  );

  const rebuildTable = useCallback(
    (g: string[][], range: DataRange, aligns?: import("./spreadsheetTypes").CellAlign[][]) => {
      skipSyncCountRef.current++;
      rawRebuildTable(g, range, aligns ?? alignments);
    },
    [rawRebuildTable, alignments],
  );

  const handleDataRangeChange = useCallback(
    (newRange: DataRange) => {
      setDataRange(newRange);
      rebuildTable(grid, newRange);
    },
    [setDataRange, rebuildTable, grid],
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
  }, [settings.widthMode, settings.fixedWidth, grid, dataRange.rows]);

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
  }, [getColWidth]);

  const [editing, setEditing] = useState<CellEditState | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Drag-resize state
  const [dragEdge, setDragEdge] = useState<"right" | "bottom" | "corner" | null>(null);
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

  const primaryColor = isDark ? "#5b9bd5" : "#1976d2";
  const headerBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const selectedBg = isDark ? "rgba(91,155,213,0.15)" : "rgba(25,118,210,0.08)";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const bgColor = isDark ? "#1e1e1e" : "#ffffff";
  const textColor = isDark ? "#d4d4d4" : "#212121";
  const headerTextColor = isDark ? "#cccccc" : "#333333";

  /* ---------------------------------------------------------------- */
  /*  Canvas total size                                                */
  /* ---------------------------------------------------------------- */

  const totalWidth = useMemo(() => {
    let w = ROW_NUM_WIDTH;
    for (let c = 0; c < GRID_COLS; c++) w += getColWidth(c);
    return w;
  }, [getColWidth]);
  const totalHeight = HEADER_HEIGHT + GRID_ROWS * rowHeight;

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

    // Set canvas size to full grid
    if (canvas.width !== totalWidth * dpr || canvas.height !== totalHeight * dpr) {
      canvas.width = totalWidth * dpr;
      canvas.height = totalHeight * dpr;
      canvas.style.width = `${totalWidth}px`;
      canvas.style.height = `${totalHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Visible area for culling
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;

    // Compute visible column range with variable widths
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
    // 固定1行目が表示される場合は row 0 を通常描画からスキップ
    const isStickyFirstRow = scrollTop > 0 && dataRange.rows > 0;
    const rawStartRow = Math.max(0, Math.floor((scrollTop - HEADER_HEIGHT) / rowHeight));
    const startRow = isStickyFirstRow ? Math.max(1, rawStartRow) : rawStartRow;
    const endRow = Math.min(GRID_ROWS, Math.ceil((scrollTop + viewHeight - HEADER_HEIGHT) / rowHeight));

    // Clip to visible area for performance
    ctx.save();
    ctx.clearRect(
      scrollLeft, scrollTop,
      viewWidth, viewHeight,
    );

    // 1. Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, viewHeight);

    // Active data range for preview or actual
    const activeRange = previewRange ?? dataRange;

    // セル描画領域をヘッダー・固定行の下に制限
    const cellAreaTop = isStickyFirstRow
      ? scrollTop + HEADER_HEIGHT + rowHeight  // 列ヘッダー + 固定1行目の下
      : scrollTop + HEADER_HEIGHT;             // 列ヘッダーの下
    ctx.save();
    ctx.beginPath();
    ctx.rect(scrollLeft, cellAreaTop, viewWidth, scrollTop + viewHeight - cellAreaTop);
    ctx.clip();

    // 3. Row/Column selection highlight
    if (selection) {
      ctx.fillStyle = selectedBg;
      if (selection.type === "row") {
        const minR = Math.min(selection.start, selection.end);
        const maxR = Math.max(selection.start, selection.end);
        const y = HEADER_HEIGHT + minR * rowHeight;
        const h = (maxR - minR + 1) * rowHeight;
        ctx.fillRect(ROW_NUM_WIDTH, y, totalWidth - ROW_NUM_WIDTH, h);
      } else if (selection.type === "col") {
        const minC = Math.min(selection.start, selection.end);
        const maxC = Math.max(selection.start, selection.end);
        const x = getColX(minC);
        let w = 0;
        for (let c = minC; c <= maxC; c++) w += getColWidth(c);
        ctx.fillRect(x, HEADER_HEIGHT, w, totalHeight - HEADER_HEIGHT);
      }
    }

    // 4. Grid lines
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();

    // Vertical lines
    for (let c = startCol; c <= endCol; c++) {
      const x = getColX(c);
      ctx.moveTo(x, scrollTop);
      ctx.lineTo(x, Math.min(scrollTop + viewHeight, totalHeight));
    }
    // Row number column right border
    if (scrollLeft < ROW_NUM_WIDTH) {
      ctx.moveTo(ROW_NUM_WIDTH, scrollTop);
      ctx.lineTo(ROW_NUM_WIDTH, Math.min(scrollTop + viewHeight, totalHeight));
    }

    // Horizontal lines
    for (let r = startRow; r <= endRow; r++) {
      const y = HEADER_HEIGHT + r * rowHeight;
      ctx.moveTo(scrollLeft, y);
      ctx.lineTo(Math.min(scrollLeft + viewWidth, totalWidth), y);
    }
    // Header row bottom border
    if (scrollTop < HEADER_HEIGHT) {
      ctx.moveTo(scrollLeft, HEADER_HEIGHT);
      ctx.lineTo(Math.min(scrollLeft + viewWidth, totalWidth), HEADER_HEIGHT);
    }

    ctx.stroke();

    // 5. Data range border (thick)
    const drRight = getColX(activeRange.cols);
    const drBottom = HEADER_HEIGHT + activeRange.rows * rowHeight;
    const drLeft = ROW_NUM_WIDTH;
    const drTop = HEADER_HEIGHT;

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(drLeft, drTop, drRight - drLeft, drBottom - drTop);
    ctx.stroke();

    // 6. Cell text
    ctx.fillStyle = textColor;
    ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textBaseline = "middle";

    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const value = grid[r][c];
        if (!value) continue;
        if (editing && editing.row === r && editing.col === c) continue;

        const cw = getColWidth(c);
        const cellLeft = getColX(c);
        const cellY = HEADER_HEIGHT + r * rowHeight + rowHeight / 2;
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
        ctx.rect(cellLeft, HEADER_HEIGHT + r * rowHeight, cw, rowHeight);
        ctx.clip();
        ctx.fillText(value, textX, cellY);
        ctx.restore();
      }
    }

    // セル描画クリップを解除
    ctx.restore();
    ctx.save(); // 外側の save/restore 用に再度 save

    // 6.5. Sticky first data row (row 0) — テーブルのヘッダー行を固定表示
    const stickyRowY = scrollTop + HEADER_HEIGHT; // 固定表示位置
    if (isStickyFirstRow) {
      // 1行目がスクロールで隠れている場合、固定位置に再描画
      // 背景を描画
      ctx.fillStyle = headerBg;
      ctx.fillRect(ROW_NUM_WIDTH, stickyRowY, totalWidth - ROW_NUM_WIDTH, rowHeight);
      // 下辺の区切り線
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scrollLeft, stickyRowY + rowHeight);
      ctx.lineTo(scrollLeft + viewWidth, stickyRowY + rowHeight);
      ctx.stroke();

      // 固定1行目の行番号
      ctx.fillStyle = headerBg;
      ctx.fillRect(scrollLeft, stickyRowY, ROW_NUM_WIDTH, rowHeight);
      ctx.fillStyle = headerTextColor;
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("1", scrollLeft + ROW_NUM_WIDTH / 2, stickyRowY + rowHeight / 2);
      // 区切り線
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, stickyRowY);
      ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, stickyRowY + rowHeight);
      ctx.stroke();

      // 1行目のテキストを再描画
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

    // 7. Row number column (sticky left) — 背景でセルを上書き
    // 行番号は固定ヘッダー（列ヘッダー + 固定1行目）の下からのみ描画
    ctx.save();
    ctx.beginPath();
    ctx.rect(scrollLeft, cellAreaTop, ROW_NUM_WIDTH, scrollTop + viewHeight - cellAreaTop);
    ctx.clip();

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, cellAreaTop, ROW_NUM_WIDTH, scrollTop + viewHeight - cellAreaTop);
    // 行番号の区切り線
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

    for (let r = startRow; r < endRow; r++) {
      const x = scrollLeft + ROW_NUM_WIDTH / 2;
      const y = HEADER_HEIGHT + r * rowHeight + rowHeight / 2;

      if (selection?.type === "row" &&
          r >= Math.min(selection.start, selection.end) &&
          r <= Math.max(selection.start, selection.end)) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(scrollLeft, HEADER_HEIGHT + r * rowHeight, ROW_NUM_WIDTH, rowHeight);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      ctx.fillText(String(r + 1), x, y);
    }
    ctx.restore();

    // 8. Column header row (sticky top) — 背景でセルを上書き
    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, HEADER_HEIGHT);
    // ヘッダーの区切り線
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

    // 9. Top-left corner (sticky both) — 背景で上書き
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

    // 10. Cell selection outline (only for cell selection)
    if (selection?.type === "cell") {
      const selCw = getColWidth(selection.col);
      const cellX = getColX(selection.col);
      const cellY = HEADER_HEIGHT + selection.row * rowHeight;
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX + 1, cellY + 1, selCw - 2, rowHeight - 2);
    }

    // 11. Resize handle (corner indicator)
    const handleX = drRight - 5;
    const handleY = drBottom - 5;
    ctx.fillStyle = primaryColor;
    ctx.fillRect(handleX, handleY, 10, 10);

    // 12. Reorder drag indicator
    if (reorderDrag && reorderDrag.targetIndex !== null) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (reorderDrag.type === "row") {
        const indicatorY = HEADER_HEIGHT + reorderDrag.targetIndex * rowHeight;
        ctx.moveTo(ROW_NUM_WIDTH, indicatorY);
        ctx.lineTo(totalWidth, indicatorY);
      } else {
        const indicatorX = getColX(reorderDrag.targetIndex);
        ctx.moveTo(indicatorX, HEADER_HEIGHT);
        ctx.lineTo(indicatorX, totalHeight);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [
    alignments, bgColor, borderColor, dataRange, editing, getColWidth, getColX, grid, headerBg, headerTextColor,
    previewRange, primaryColor, reorderDrag, rowHeight, selectedBg, selection, textColor, totalHeight, totalWidth,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Redraw triggers                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  // ProseMirror のドキュメント変更（Undo/Redo 含む）を監視してグリッドを再同期
  // 自分自身が ProseMirror を更新した場合はスキップ（カウンターで判定）
  useEffect(() => {
    const handler = () => {
      if (skipSyncCountRef.current > 0) {
        skipSyncCountRef.current--;
        return;
      }
      let tableNode: PMNode | null = null;
      editor.state.doc.descendants((node) => {
        if (tableNode) return false;
        if (node.type.name === "table") { tableNode = node; return false; }
      });
      if (!tableNode) return;
      const { data, range, alignments: pmAligns } = extractTableData(tableNode);
      initGrid(data);
      setDataRange(range);
      // ProseMirror の配置情報を GRID_ROWS × GRID_COLS に拡張
      const fullAligns: CellAlign[][] = Array.from({ length: GRID_ROWS }, (_, r) =>
        Array.from({ length: GRID_COLS }, (_, c) => pmAligns[r]?.[c] ?? null),
      );
      setAlignments(fullAligns);
    };
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor, initGrid, setDataRange, setAlignments]);

  // Scroll-driven redraw
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
    if (y < HEADER_HEIGHT || x < ROW_NUM_WIDTH) return null;
    const col = getColAtX(x);
    const row = Math.floor((y - HEADER_HEIGHT) / rowHeight);
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null;
    return { row, col };
  }, [getCanvasCoords, getColAtX, rowHeight]);

  const getHeaderCol = useCallback((e: React.MouseEvent): number | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (y >= HEADER_HEIGHT || x < ROW_NUM_WIDTH) return null;
    const col = getColAtX(x);
    return col >= 0 && col < GRID_COLS ? col : null;
  }, [getCanvasCoords, getColAtX]);

  const getRowNum = useCallback((e: React.MouseEvent): number | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (x >= ROW_NUM_WIDTH || y < HEADER_HEIGHT) return null;
    const row = Math.floor((y - HEADER_HEIGHT) / rowHeight);
    return row >= 0 && row < GRID_ROWS ? row : null;
  }, [getCanvasCoords, rowHeight]);

  /* ---------------------------------------------------------------- */
  /*  Resize edge detection                                            */
  /* ---------------------------------------------------------------- */

  const isNearRightEdge = useCallback((x: number): boolean => {
    const edgeX = getColX(dataRange.cols);
    return Math.abs(x - edgeX) < RESIZE_HANDLE_THRESHOLD;
  }, [dataRange.cols, getColX]);

  const isNearBottomEdge = useCallback((y: number): boolean => {
    const edgeY = HEADER_HEIGHT + dataRange.rows * rowHeight;
    return Math.abs(y - edgeY) < RESIZE_HANDLE_THRESHOLD;
  }, [dataRange.rows, rowHeight]);

  /* ---------------------------------------------------------------- */
  /*  Editing helpers                                                  */
  /* ---------------------------------------------------------------- */

  const startEditing = useCallback((row: number, col: number) => {
    const value = grid[row][col];
    setEditing({ row, col, value });
    setEditValue(value);
  }, [grid]);

  const startEditingWithChar = useCallback((row: number, col: number, char: string) => {
    setCellValue(row, col, char);
    if (isInDataRange(row, col, dataRange)) {
      syncCellToProseMirror(row, col, char);
    }
    setEditing({ row, col, value: char });
    setEditValue(char);
  }, [setCellValue, dataRange, syncCellToProseMirror]);

  const commitEditing = useCallback((value: string) => {
    if (!editing) return;
    setCellValue(editing.row, editing.col, value);
    if (isInDataRange(editing.row, editing.col, dataRange)) {
      syncCellToProseMirror(editing.row, editing.col, value);
    }
    setEditing(null);
  }, [editing, setCellValue, dataRange, syncCellToProseMirror]);

  const cancelEditing = useCallback(() => {
    setEditing(null);
  }, []);

  // Auto-focus input when editing starts
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
    // Check header col
    const col = getHeaderCol(e);
    if (col !== null) {
      if (e.shiftKey && selection?.type === "col") {
        // Shift+クリックで範囲拡張
        setSelection({ type: "col", start: selection.start, end: col });
      } else {
        setSelection({ type: "col", start: col, end: col });
      }
      setEditing(null);
      return;
    }

    // Check row num
    const row = getRowNum(e);
    if (row !== null) {
      if (e.shiftKey && selection?.type === "row") {
        setSelection({ type: "row", start: selection.start, end: row });
      } else {
        setSelection({ type: "row", start: row, end: row });
      }
      setEditing(null);
      return;
    }

    // Check cell
    const cell = getGridCoords(e);
    if (cell) {
      setSelection({ type: "cell", row: cell.row, col: cell.col });
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
    // スプレッドシート上では常にデフォルトのコンテキストメニューを抑止
    e.preventDefault();
    e.stopPropagation();

    // Row context menu
    const row = getRowNum(e);
    if (row !== null) {
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "row", index: row },
      });
      return;
    }

    // Column context menu
    const col = getHeaderCol(e);
    if (col !== null) {
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "col", index: col },
      });
    }
  }, [getRowNum, getHeaderCol]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const { x, y } = coords;

    // --- Resize drag ---
    const nearRight = isNearRightEdge(x);
    const nearBottom = isNearBottomEdge(y);

    let edge: "right" | "bottom" | "corner" | null = null;
    if (nearRight && nearBottom) edge = "corner";
    else if (nearRight && y >= HEADER_HEIGHT && y <= HEADER_HEIGHT + dataRange.rows * rowHeight) edge = "right";
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
        const newRow = Math.floor((my - HEADER_HEIGHT) / rowHeight);

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

    // --- Row/Column reorder drag (with drag threshold) ---
    // 行番号エリア: mousedown → mousemove で 5px 以上動いたらドラッグ開始
    const DRAG_THRESHOLD = 5;

    if (x < ROW_NUM_WIDTH && y >= HEADER_HEIGHT) {
      const srcRow = Math.floor((y - HEADER_HEIGHT) / rowHeight);
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
            const targetRow = Math.max(0, Math.min(GRID_ROWS, Math.floor((my - HEADER_HEIGHT) / rowHeight)));
            setReorderDrag((prev) => prev ? { ...prev, targetIndex: targetRow } : null);
          }
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          if (dragStarted) {
            const drag = reorderDragRef.current;
            if (drag && drag.targetIndex !== null && drag.targetIndex !== drag.sourceIndex) {
              const from = drag.sourceIndex;
              const to = drag.targetIndex > from ? drag.targetIndex - 1 : drag.targetIndex;
              if (from !== to) {
                swapRows(from, to);
                if (from < dataRange.rows && to < dataRange.rows) {
                  rebuildTable(grid, dataRange);
                }
                setSelection({ type: "row", start: to, end: to });
              }
            }
            setReorderDrag(null);
            suppressClickRef.current = true;
          }
          // ドラッグしなかった場合は click イベントで選択処理される
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return;
      }
    }

    // 列ヘッダーエリア: 同様にドラッグ閾値付き
    if (y < HEADER_HEIGHT && x >= ROW_NUM_WIDTH) {
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
            if (drag && drag.targetIndex !== null && drag.targetIndex !== drag.sourceIndex) {
              const from = drag.sourceIndex;
              const to = drag.targetIndex > from ? drag.targetIndex - 1 : drag.targetIndex;
              if (from !== to) {
                swapCols(from, to);
                if (from < dataRange.cols && to < dataRange.cols) {
                  rebuildTable(grid, dataRange);
                }
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
  }, [
    getCanvasCoords, getColAtX, getColX, isNearRightEdge, isNearBottomEdge, dataRange, rowHeight,
    handleDataRangeChange, setSelection, swapRows, swapCols, rebuildTable, grid,
  ]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const { x, y } = coords;

    const nearRight = isNearRightEdge(x);
    const nearBottom = isNearBottomEdge(y);

    if (nearRight && nearBottom) {
      canvas.style.cursor = "nwse-resize";
    } else if (nearRight && y >= HEADER_HEIGHT && y <= HEADER_HEIGHT + dataRange.rows * rowHeight) {
      canvas.style.cursor = "col-resize";
    } else if (nearBottom && x >= ROW_NUM_WIDTH && x <= getColX(dataRange.cols)) {
      canvas.style.cursor = "row-resize";
    } else if (y < HEADER_HEIGHT && x >= ROW_NUM_WIDTH) {
      canvas.style.cursor = "grab";
    } else if (x < ROW_NUM_WIDTH && y >= HEADER_HEIGHT) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "cell";
    }
  }, [getCanvasCoords, getColX, isNearRightEdge, isNearBottomEdge, dataRange, rowHeight]);

  /* ---------------------------------------------------------------- */
  /*  Canvas keyboard events                                           */
  /* ---------------------------------------------------------------- */

  const handleKeyNavigation = useCallback(
    (key: string, shiftKey: boolean) => {
      if (!selection) return;

      let row = selection.type === "cell" ? selection.row
        : selection.type === "row" ? selection.start : 0;
      let col = selection.type === "cell" ? selection.col
        : selection.type === "col" ? selection.start : 0;

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
    [selection, setSelection],
  );

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) return;

    const { key, shiftKey, ctrlKey, metaKey, altKey } = e;

    // Undo/Redo を editor に転送
    if ((ctrlKey || metaKey) && key === "z") {
      e.preventDefault();
      if (shiftKey) {
        editor.chain().redo().run();
      } else {
        editor.chain().undo().run();
      }
      return;
    }
    if ((ctrlKey || metaKey) && key === "y") {
      e.preventDefault();
      editor.chain().redo().run();
      return;
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
      e.preventDefault();
      if (selection?.type === "cell") {
        setCellValue(selection.row, selection.col, "");
        if (isInDataRange(selection.row, selection.col, dataRange)) {
          syncCellToProseMirror(selection.row, selection.col, "");
        }
      }
      return;
    }

    // Printable character
    if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
      e.preventDefault();
      if (selection?.type === "cell") {
        startEditingWithChar(selection.row, selection.col, key);
      }
    }
  }, [
    editing, editor, selection, handleKeyNavigation, startEditing,
    startEditingWithChar, setCellValue, dataRange, syncCellToProseMirror,
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
      // Return focus to canvas
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
    top: HEADER_HEIGHT + editing.row * rowHeight,
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
      if (!val || !selection) return;
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

      rebuildTable(grid, dataRange, newAligns);
    },
    [selection, setCellAlign, setAlignments, alignments, rebuildTable, grid, dataRange],
  );

  const iconSx = { fontSize: 16 };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Alignment toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark), px: 1, py: 0.25, gap: 0.5, flexShrink: 0 }}>
        <ToggleButtonGroup exclusive size="small" sx={{ height: 24 }} onChange={handleAlignChange}>
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
        <Tooltip title={t("spreadsheetCellSettings")} placement="top">
          <IconButton size="small" onClick={() => { setSettingsDraft(settings); setSettingsOpen(true); }} sx={{ ml: 0.5 }}>
            <SettingsIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Cell size settings dialog */}
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

      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleInputKeyDown}
        onBlur={handleInputBlur}
        style={inputStyle}
      />

      {contextMenu !== null && (
        <SpreadsheetContextMenu
          contextMenu={contextMenu}
          dataRange={dataRange}
          grid={grid}
          editor={editor}
          onClose={handleContextMenuClose}
          onInsertRow={insertRow}
          onDeleteRow={deleteRow}
          onInsertCol={insertCol}
          onDeleteCol={deleteCol}
          onSwapRows={swapRows}
          onSwapCols={swapCols}
          setDataRange={setDataRange}
          syncCellToProseMirror={syncCellToProseMirror}
          isDark={isDark}
          t={t}
        />
      )}
    </Box>
    </Box>
  );
};
