import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DataRange } from "./spreadsheetTypes";
import { GRID_COLS, GRID_ROWS } from "./spreadsheetUtils";

interface SpreadsheetDataRangeProps {
  readonly dataRange: DataRange;
  readonly onResize: (newRange: DataRange) => void;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly isDark: boolean;
}

interface HandlePos {
  readonly top: number;
  readonly left: number;
}

interface PreviewRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface DragState {
  readonly isDragging: boolean;
  readonly previewRange: DataRange | null;
  readonly previewRect: PreviewRect | null;
}

const HANDLE_SIZE = 8;
const MIN_ROWS = 2;
const MIN_COLS = 1;

/**
 * Finds the target cell in the table for the data range corner.
 * Returns the cell element or null if not found.
 */
function findCornerCell(
  container: HTMLDivElement,
  dataRange: DataRange,
): HTMLTableCellElement | null {
  const table = container.querySelector("table");
  if (!table) return null;

  const rows = table.querySelectorAll("tbody tr");
  const targetRow = rows[dataRange.rows - 1];
  if (!targetRow) return null;

  // +1 because first td is the row number column
  const cells = targetRow.querySelectorAll("td");
  const targetCell = cells[dataRange.cols] as HTMLTableCellElement | undefined;
  return targetCell ?? null;
}

/**
 * Determines which data cell is under the given client coordinates.
 * Returns 0-indexed row/col in data space (excluding row number column).
 */
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

/**
 * Computes the preview rectangle for a given data range.
 */
function computePreviewRect(
  container: HTMLDivElement,
  range: DataRange,
): PreviewRect | null {
  const table = container.querySelector("table");
  if (!table) return null;

  // Top-left corner: first data cell (row 0, col 0 → cells[1])
  const firstRow = table.querySelectorAll("tbody tr")[0];
  if (!firstRow) return null;
  const firstCell = firstRow.querySelectorAll("td")[1] as
    | HTMLTableCellElement
    | undefined;
  if (!firstCell) return null;

  // Bottom-right corner
  const cornerCell = findCornerCell(container, range);
  if (!cornerCell) return null;

  const containerRect = container.getBoundingClientRect();
  const firstRect = firstCell.getBoundingClientRect();
  const cornerRect = cornerCell.getBoundingClientRect();

  return {
    top: firstRect.top - containerRect.top + container.scrollTop,
    left: firstRect.left - containerRect.left + container.scrollLeft,
    width: cornerRect.right - firstRect.left,
    height: cornerRect.bottom - firstRect.top,
  };
}

export function SpreadsheetDataRange({
  dataRange,
  onResize,
  containerRef,
  isDark,
}: Readonly<SpreadsheetDataRangeProps>) {
  const primaryColor = isDark ? "#5b9bd5" : "#1976d2";

  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    previewRange: null,
    previewRect: null,
  });

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const updateHandlePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const cornerCell = findCornerCell(container, dataRange);
    if (!cornerCell) return;

    const containerRect = container.getBoundingClientRect();
    const cellRect = cornerCell.getBoundingClientRect();

    setHandlePos({
      top:
        cellRect.bottom -
        containerRect.top +
        container.scrollTop -
        HANDLE_SIZE / 2,
      left:
        cellRect.right -
        containerRect.left +
        container.scrollLeft -
        HANDLE_SIZE / 2,
    });
  }, [containerRef, dataRange]);

  // Recalculate handle position on layout
  useLayoutEffect(() => {
    updateHandlePosition();
  }, [updateHandlePosition]);

  // Recalculate on scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateHandlePosition();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef, updateHandlePosition]);

  // Observe table layout changes via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const table = container.querySelector("table");
    if (!table) return;

    const observer = new ResizeObserver(() => {
      updateHandlePosition();
    });
    observer.observe(table);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, updateHandlePosition]);

  // Mouse event handlers for dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const rect = computePreviewRect(container, dataRange);

      setDragState({
        isDragging: true,
        previewRange: { ...dataRange },
        previewRect: rect,
      });

      const handleMouseMove = (ev: MouseEvent) => {
        const cont = containerRef.current;
        if (!cont) return;

        const cell = getCellAtPoint(cont, ev.clientX, ev.clientY);
        if (!cell) return;

        const newRows = Math.max(MIN_ROWS, Math.min(cell.row + 1, GRID_ROWS));
        const newCols = Math.max(MIN_COLS, Math.min(cell.col + 1, GRID_COLS));

        const newRange: DataRange = { rows: newRows, cols: newCols };
        const newRect = computePreviewRect(cont, newRange);

        setDragState({
          isDragging: true,
          previewRange: newRange,
          previewRect: newRect,
        });
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        const current = dragStateRef.current;
        if (current.previewRange) {
          onResize(current.previewRange);
        }

        setDragState({
          isDragging: false,
          previewRange: null,
          previewRect: null,
        });
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [containerRef, dataRange, onResize],
  );

  if (!handlePos) return null;

  return (
    <>
      {/* Resize handle */}
      <div
        style={{
          position: "absolute",
          top: handlePos.top,
          left: handlePos.left,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          background: primaryColor,
          cursor: "nwse-resize",
          borderRadius: 1,
          zIndex: 10,
          pointerEvents: "auto",
        }}
        onMouseDown={handleMouseDown}
      />

      {/* Preview overlay during drag */}
      {dragState.isDragging && dragState.previewRect && (
        <div
          style={{
            position: "absolute",
            top: dragState.previewRect.top,
            left: dragState.previewRect.left,
            width: dragState.previewRect.width,
            height: dragState.previewRect.height,
            border: `2px dashed ${primaryColor}`,
            pointerEvents: "none",
            zIndex: 9,
            boxSizing: "border-box",
          }}
        />
      )}
    </>
  );
}
