import { Box } from "@mui/material";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellEditState, ContextMenuState, DataRange } from "./spreadsheetTypes";
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

const COL_WIDTH = 100;
const ROW_HEIGHT = 28;
const ROW_NUM_WIDTH = 40;
const HEADER_HEIGHT = 28;
const RESIZE_HANDLE_THRESHOLD = 4;
const MIN_RESIZE_ROWS = 2;
const MIN_RESIZE_COLS = 1;

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
    if (!tableNode) return { rows: 1, cols: 1, data: [] as string[][] };
    const { data, range } = extractTableData(tableNode);
    return { rows: range.rows, cols: range.cols, data };
  }, []);

  const {
    grid,
    dataRange,
    selection,
    setCellValue,
    setDataRange,
    setSelection,
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
  });

  const { syncCellToProseMirror, rebuildTable } = useSpreadsheetSync({ editor });

  const handleDataRangeChange = useCallback(
    (newRange: DataRange) => {
      setDataRange(newRange);
      rebuildTable(grid, newRange);
    },
    [setDataRange, rebuildTable, grid],
  );

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

  const totalWidth = ROW_NUM_WIDTH + GRID_COLS * COL_WIDTH;
  const totalHeight = HEADER_HEIGHT + GRID_ROWS * ROW_HEIGHT;

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

    const startCol = Math.max(0, Math.floor((scrollLeft - ROW_NUM_WIDTH) / COL_WIDTH));
    const endCol = Math.min(GRID_COLS, Math.ceil((scrollLeft + viewWidth - ROW_NUM_WIDTH) / COL_WIDTH));
    const startRow = Math.max(0, Math.floor((scrollTop - HEADER_HEIGHT) / ROW_HEIGHT));
    const endRow = Math.min(GRID_ROWS, Math.ceil((scrollTop + viewHeight - HEADER_HEIGHT) / ROW_HEIGHT));

    // Clip to visible area for performance
    ctx.save();
    ctx.clearRect(
      scrollLeft, scrollTop,
      viewWidth, viewHeight,
    );

    // 1. Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, viewHeight);

    // 2. Header backgrounds
    ctx.fillStyle = headerBg;
    // Column header row (top)
    if (scrollTop < HEADER_HEIGHT) {
      ctx.fillRect(scrollLeft, scrollTop, viewWidth, HEADER_HEIGHT - scrollTop);
    }
    // Row number column (left)
    if (scrollLeft < ROW_NUM_WIDTH) {
      ctx.fillRect(scrollLeft, scrollTop, ROW_NUM_WIDTH - scrollLeft, viewHeight);
    }

    // Active data range for preview or actual
    const activeRange = previewRange ?? dataRange;

    // 3. Row/Column selection highlight
    if (selection) {
      ctx.fillStyle = selectedBg;
      if (selection.type === "row") {
        const minR = Math.min(selection.start, selection.end);
        const maxR = Math.max(selection.start, selection.end);
        const y = HEADER_HEIGHT + minR * ROW_HEIGHT;
        const h = (maxR - minR + 1) * ROW_HEIGHT;
        ctx.fillRect(ROW_NUM_WIDTH, y, totalWidth - ROW_NUM_WIDTH, h);
      } else if (selection.type === "col") {
        const minC = Math.min(selection.start, selection.end);
        const maxC = Math.max(selection.start, selection.end);
        const x = ROW_NUM_WIDTH + minC * COL_WIDTH;
        const w = (maxC - minC + 1) * COL_WIDTH;
        ctx.fillRect(x, HEADER_HEIGHT, w, totalHeight - HEADER_HEIGHT);
      }
    }

    // 4. Grid lines
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();

    // Vertical lines
    for (let c = startCol; c <= endCol; c++) {
      const x = ROW_NUM_WIDTH + c * COL_WIDTH;
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
      const y = HEADER_HEIGHT + r * ROW_HEIGHT;
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
    const drRight = ROW_NUM_WIDTH + activeRange.cols * COL_WIDTH;
    const drBottom = HEADER_HEIGHT + activeRange.rows * ROW_HEIGHT;
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
    ctx.textAlign = "left";

    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const value = grid[r][c];
        if (!value) continue;
        // Skip the cell being edited
        if (editing && editing.row === r && editing.col === c) continue;

        const x = ROW_NUM_WIDTH + c * COL_WIDTH + 6;
        const y = HEADER_HEIGHT + r * ROW_HEIGHT + ROW_HEIGHT / 2;

        // Clip text to cell bounds
        ctx.save();
        ctx.beginPath();
        ctx.rect(
          ROW_NUM_WIDTH + c * COL_WIDTH,
          HEADER_HEIGHT + r * ROW_HEIGHT,
          COL_WIDTH,
          ROW_HEIGHT,
        );
        ctx.clip();
        ctx.fillText(value, x, y);
        ctx.restore();
      }
    }

    // 7. Column headers
    ctx.fillStyle = headerTextColor;
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let c = startCol; c < endCol; c++) {
      const x = ROW_NUM_WIDTH + c * COL_WIDTH + COL_WIDTH / 2;
      const y = HEADER_HEIGHT / 2;

      // Header background for selected column
      if (selection?.type === "col" &&
          c >= Math.min(selection.start, selection.end) &&
          c <= Math.max(selection.start, selection.end)) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(ROW_NUM_WIDTH + c * COL_WIDTH, 0, COL_WIDTH, HEADER_HEIGHT);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      ctx.fillText(columnLabel(c), x, y);
    }

    // 8. Row numbers
    ctx.textAlign = "center";

    for (let r = startRow; r < endRow; r++) {
      const x = ROW_NUM_WIDTH / 2;
      const y = HEADER_HEIGHT + r * ROW_HEIGHT + ROW_HEIGHT / 2;

      // Row number background for selected row
      if (selection?.type === "row" &&
          r >= Math.min(selection.start, selection.end) &&
          r <= Math.max(selection.start, selection.end)) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(0, HEADER_HEIGHT + r * ROW_HEIGHT, ROW_NUM_WIDTH, ROW_HEIGHT);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      ctx.fillText(String(r + 1), x, y);
    }

    // 9. Cell selection outline (only for cell selection)
    if (selection?.type === "cell") {
      const cellX = ROW_NUM_WIDTH + selection.col * COL_WIDTH;
      const cellY = HEADER_HEIGHT + selection.row * ROW_HEIGHT;
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX + 1, cellY + 1, COL_WIDTH - 2, ROW_HEIGHT - 2);
    }

    // 10. Resize handle (corner indicator)
    const handleX = drRight - 5;
    const handleY = drBottom - 5;
    ctx.fillStyle = primaryColor;
    ctx.fillRect(handleX, handleY, 10, 10);

    // 11. Reorder drag indicator
    if (reorderDrag && reorderDrag.targetIndex !== null) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (reorderDrag.type === "row") {
        const indicatorY = HEADER_HEIGHT + reorderDrag.targetIndex * ROW_HEIGHT;
        ctx.moveTo(ROW_NUM_WIDTH, indicatorY);
        ctx.lineTo(totalWidth, indicatorY);
      } else {
        const indicatorX = ROW_NUM_WIDTH + reorderDrag.targetIndex * COL_WIDTH;
        ctx.moveTo(indicatorX, HEADER_HEIGHT);
        ctx.lineTo(indicatorX, totalHeight);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [
    bgColor, borderColor, dataRange, editing, grid, headerBg, headerTextColor,
    previewRange, primaryColor, reorderDrag, selectedBg, selection, textColor, totalHeight, totalWidth,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Redraw triggers                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

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
    const col = Math.floor((x - ROW_NUM_WIDTH) / COL_WIDTH);
    const row = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null;
    return { row, col };
  }, [getCanvasCoords]);

  const getHeaderCol = useCallback((e: React.MouseEvent): number | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (y >= HEADER_HEIGHT || x < ROW_NUM_WIDTH) return null;
    const col = Math.floor((x - ROW_NUM_WIDTH) / COL_WIDTH);
    return col >= 0 && col < GRID_COLS ? col : null;
  }, [getCanvasCoords]);

  const getRowNum = useCallback((e: React.MouseEvent): number | null => {
    const coords = getCanvasCoords(e);
    if (!coords) return null;
    const { x, y } = coords;
    if (x >= ROW_NUM_WIDTH || y < HEADER_HEIGHT) return null;
    const row = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
    return row >= 0 && row < GRID_ROWS ? row : null;
  }, [getCanvasCoords]);

  /* ---------------------------------------------------------------- */
  /*  Resize edge detection                                            */
  /* ---------------------------------------------------------------- */

  const isNearRightEdge = useCallback((x: number): boolean => {
    const edgeX = ROW_NUM_WIDTH + dataRange.cols * COL_WIDTH;
    return Math.abs(x - edgeX) < RESIZE_HANDLE_THRESHOLD;
  }, [dataRange.cols]);

  const isNearBottomEdge = useCallback((y: number): boolean => {
    const edgeY = HEADER_HEIGHT + dataRange.rows * ROW_HEIGHT;
    return Math.abs(y - edgeY) < RESIZE_HANDLE_THRESHOLD;
  }, [dataRange.rows]);

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
    // Row context menu
    const row = getRowNum(e);
    if (row !== null) {
      e.preventDefault();
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
      e.preventDefault();
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
    else if (nearRight && y >= HEADER_HEIGHT && y <= HEADER_HEIGHT + dataRange.rows * ROW_HEIGHT) edge = "right";
    else if (nearBottom && x >= ROW_NUM_WIDTH && x <= ROW_NUM_WIDTH + dataRange.cols * COL_WIDTH) edge = "bottom";

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

        const newCol = Math.floor((mx - ROW_NUM_WIDTH) / COL_WIDTH);
        const newRow = Math.floor((my - HEADER_HEIGHT) / ROW_HEIGHT);

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

    // --- Row/Column reorder drag ---
    // 行番号エリアをドラッグ → 行入れ替え
    if (x < ROW_NUM_WIDTH && y >= HEADER_HEIGHT) {
      const srcRow = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
      if (srcRow >= 0 && srcRow < GRID_ROWS) {
        e.preventDefault();
        setSelection({ type: "row", start: srcRow, end: srcRow });
        setReorderDrag({ type: "row", sourceIndex: srcRow, targetIndex: null });

        const onMouseMove = (ev: MouseEvent) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const my = ev.clientY - rect.top;
          const targetRow = Math.max(0, Math.min(GRID_ROWS, Math.floor((my - HEADER_HEIGHT) / ROW_HEIGHT)));
          setReorderDrag((prev) => prev ? { ...prev, targetIndex: targetRow } : null);
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          const drag = reorderDragRef.current;
          if (drag && drag.targetIndex !== null && drag.targetIndex !== drag.sourceIndex) {
            // 挿入先の調整: ドラッグ先がソースより後ろの場合、1つ手前に
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
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return;
      }
    }

    // 列ヘッダーエリアをドラッグ → 列入れ替え
    if (y < HEADER_HEIGHT && x >= ROW_NUM_WIDTH) {
      const srcCol = Math.floor((x - ROW_NUM_WIDTH) / COL_WIDTH);
      if (srcCol >= 0 && srcCol < GRID_COLS) {
        e.preventDefault();
        setSelection({ type: "col", start: srcCol, end: srcCol });
        setReorderDrag({ type: "col", sourceIndex: srcCol, targetIndex: null });

        const onMouseMove = (ev: MouseEvent) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const targetCol = Math.max(0, Math.min(GRID_COLS, Math.floor((mx - ROW_NUM_WIDTH) / COL_WIDTH)));
          setReorderDrag((prev) => prev ? { ...prev, targetIndex: targetCol } : null);
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
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
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return;
      }
    }
  }, [
    getCanvasCoords, isNearRightEdge, isNearBottomEdge, dataRange,
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
    } else if (nearRight && y >= HEADER_HEIGHT && y <= HEADER_HEIGHT + dataRange.rows * ROW_HEIGHT) {
      canvas.style.cursor = "col-resize";
    } else if (nearBottom && x >= ROW_NUM_WIDTH && x <= ROW_NUM_WIDTH + dataRange.cols * COL_WIDTH) {
      canvas.style.cursor = "row-resize";
    } else if (y < HEADER_HEIGHT && x >= ROW_NUM_WIDTH) {
      canvas.style.cursor = "grab";
    } else if (x < ROW_NUM_WIDTH && y >= HEADER_HEIGHT) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "cell";
    }
  }, [getCanvasCoords, isNearRightEdge, isNearBottomEdge, dataRange]);

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
    editing, selection, handleKeyNavigation, startEditing,
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
    left: ROW_NUM_WIDTH + editing.col * COL_WIDTH,
    top: HEADER_HEIGHT + editing.row * ROW_HEIGHT,
    width: COL_WIDTH,
    height: ROW_HEIGHT,
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
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Box
      ref={containerRef}
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
  );
};
