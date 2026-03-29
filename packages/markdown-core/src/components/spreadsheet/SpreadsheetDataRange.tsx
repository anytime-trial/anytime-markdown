import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DataRange } from "./spreadsheetTypes";
import { GRID_COLS, GRID_ROWS } from "./spreadsheetUtils";

interface SpreadsheetDataRangeProps {
  readonly dataRange: DataRange;
  readonly onResize: (newRange: DataRange) => void;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly isDark: boolean;
}

/** 右辺・下辺・角の位置 */
interface EdgePositions {
  /** 右辺: x座標, top, height */
  right: { x: number; top: number; height: number } | null;
  /** 下辺: y座標, left, width */
  bottom: { y: number; left: number; width: number } | null;
}

const HANDLE_THICKNESS = 6;
const MIN_ROWS = 2;
const MIN_COLS = 1;

/** テーブルの tbody から辺の位置を計算する */
function computeEdgePositions(
  container: HTMLDivElement,
  dataRange: DataRange,
): EdgePositions {
  const table = container.querySelector("table");
  if (!table) return { right: null, bottom: null };

  const tbody = table.querySelector("tbody");
  if (!tbody) return { right: null, bottom: null };

  const trs = tbody.querySelectorAll("tr");
  if (trs.length === 0) return { right: null, bottom: null };

  const containerRect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;
  const scrollLeft = container.scrollLeft;

  // 右辺: dataRange.cols 番目のデータセル（+1 for row number column）の右端
  const firstRow = trs[0];
  const firstRowCells = firstRow?.querySelectorAll("td");
  // cells[0] = row number, cells[1] = col 0, cells[dataRange.cols] = last data col
  const rightCell = firstRowCells?.[dataRange.cols] as HTMLTableCellElement | undefined;
  const lastDataRow = trs[dataRange.rows - 1];

  let right: EdgePositions["right"] = null;
  if (rightCell && lastDataRow) {
    const rightCellRect = rightCell.getBoundingClientRect();
    const firstDataCell = firstRowCells?.[1] as HTMLTableCellElement | undefined;
    const lastRowRect = lastDataRow.getBoundingClientRect();
    if (firstDataCell) {
      const firstCellRect = firstDataCell.getBoundingClientRect();
      right = {
        x: rightCellRect.right - containerRect.left + scrollLeft,
        top: firstCellRect.top - containerRect.top + scrollTop,
        height: lastRowRect.bottom - firstCellRect.top,
      };
    }
  }

  // 下辺: dataRange.rows 番目の行の下端
  let bottom: EdgePositions["bottom"] = null;
  if (lastDataRow) {
    const lastRowRect = lastDataRow.getBoundingClientRect();
    const firstDataCell = firstRowCells?.[1] as HTMLTableCellElement | undefined;
    if (firstDataCell && rightCell) {
      const firstCellRect = firstDataCell.getBoundingClientRect();
      const rightCellRect = rightCell.getBoundingClientRect();
      bottom = {
        y: lastRowRect.bottom - containerRect.top + scrollTop,
        left: firstCellRect.left - containerRect.left + scrollLeft,
        width: rightCellRect.right - firstCellRect.left,
      };
    }
  }

  return { right, bottom };
}

/** マウス座標からセル位置を取得 */
function getCellAtPoint(
  container: HTMLDivElement,
  clientX: number,
  clientY: number,
): { row: number; col: number } | null {
  const table = container.querySelector("table");
  if (!table) return null;
  const rows = table.querySelectorAll("tbody tr");
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].querySelectorAll("td");
    for (let c = 1; c < cells.length; c++) {
      const rect = cells[c].getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return { row: r, col: c - 1 };
      }
    }
  }
  return null;
}

type DragEdge = "right" | "bottom" | "corner";

export function SpreadsheetDataRange({
  dataRange,
  onResize,
  containerRef,
  isDark,
}: Readonly<SpreadsheetDataRangeProps>) {
  const primaryColor = isDark ? "#5b9bd5" : "#1976d2";
  const [edges, setEdges] = useState<EdgePositions>({ right: null, bottom: null });
  const [dragging, setDragging] = useState<DragEdge | null>(null);
  const [previewRange, setPreviewRange] = useState<DataRange | null>(null);
  const previewRef = useRef<DataRange | null>(null);
  previewRef.current = previewRange;

  const updateEdges = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setEdges(computeEdgePositions(container, dataRange));
  }, [containerRef, dataRange]);

  useLayoutEffect(() => {
    updateEdges();
  }, [updateEdges]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => updateEdges();
    container.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => updateEdges());
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    return () => {
      container.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [containerRef, updateEdges]);

  const startDrag = useCallback(
    (edge: DragEdge, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(edge);
      setPreviewRange({ ...dataRange });

      const container = containerRef.current;
      if (!container) return;

      const onMouseMove = (ev: MouseEvent) => {
        const cont = containerRef.current;
        if (!cont) return;
        const cell = getCellAtPoint(cont, ev.clientX, ev.clientY);
        if (!cell) return;

        const newRows = edge === "right"
          ? dataRange.rows
          : Math.max(MIN_ROWS, Math.min(cell.row + 1, GRID_ROWS));
        const newCols = edge === "bottom"
          ? dataRange.cols
          : Math.max(MIN_COLS, Math.min(cell.col + 1, GRID_COLS));

        const nr: DataRange = { rows: newRows, cols: newCols };
        setPreviewRange(nr);
        previewRef.current = nr;
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        const final = previewRef.current;
        if (final) onResize(final);
        setDragging(null);
        setPreviewRange(null);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [containerRef, dataRange, onResize],
  );

  // プレビュー中の辺位置
  const previewEdges = dragging && previewRange
    ? (() => {
        const container = containerRef.current;
        if (!container) return null;
        return computeEdgePositions(container, previewRange);
      })()
    : null;

  return (
    <>
      {/* 右辺ドラッグハンドル */}
      {edges.right && (
        <div
          style={{
            position: "absolute",
            top: edges.right.top,
            left: edges.right.x - HANDLE_THICKNESS / 2,
            width: HANDLE_THICKNESS,
            height: edges.right.height,
            cursor: "col-resize",
            zIndex: 10,
          }}
          onMouseDown={(e) => startDrag("right", e)}
        />
      )}

      {/* 下辺ドラッグハンドル */}
      {edges.bottom && (
        <div
          style={{
            position: "absolute",
            top: edges.bottom.y - HANDLE_THICKNESS / 2,
            left: edges.bottom.left,
            width: edges.bottom.width,
            height: HANDLE_THICKNESS,
            cursor: "row-resize",
            zIndex: 10,
          }}
          onMouseDown={(e) => startDrag("bottom", e)}
        />
      )}

      {/* 角ドラッグハンドル */}
      {edges.right && edges.bottom && (
        <div
          style={{
            position: "absolute",
            top: edges.bottom.y - 5,
            left: edges.right.x - 5,
            width: 10,
            height: 10,
            background: primaryColor,
            cursor: "nwse-resize",
            borderRadius: 2,
            zIndex: 11,
          }}
          onMouseDown={(e) => startDrag("corner", e)}
        />
      )}

      {/* ドラッグ中のプレビュー線 */}
      {dragging && previewEdges && (
        <>
          {(dragging === "right" || dragging === "corner") && previewEdges.right && (
            <div
              style={{
                position: "absolute",
                top: previewEdges.right.top,
                left: previewEdges.right.x - 1,
                width: 2,
                height: previewEdges.right.height,
                background: primaryColor,
                opacity: 0.5,
                pointerEvents: "none",
                zIndex: 9,
              }}
            />
          )}
          {(dragging === "bottom" || dragging === "corner") && previewEdges.bottom && (
            <div
              style={{
                position: "absolute",
                top: previewEdges.bottom.y - 1,
                left: previewEdges.bottom.left,
                width: previewEdges.bottom.width,
                height: 2,
                background: primaryColor,
                opacity: 0.5,
                pointerEvents: "none",
                zIndex: 9,
              }}
            />
          )}
        </>
      )}
    </>
  );
}
