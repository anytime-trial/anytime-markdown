import { Box } from "@mui/material";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import React, { useCallback, useRef, useState } from "react";
import type { CellEditState, ContextMenuState } from "./spreadsheetTypes";
import SpreadsheetCell from "./SpreadsheetCell";
import { SpreadsheetContextMenu } from "./SpreadsheetContextMenu";
import { useSpreadsheetState } from "./useSpreadsheetState";
import { useSpreadsheetSync, extractTableData } from "./useSpreadsheetSync";
import {
  columnLabel,
  GRID_COLS,
  GRID_ROWS,
  isInDataRange,
} from "./spreadsheetUtils";

interface SpreadsheetGridProps {
  readonly editor: Editor;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
}

export const SpreadsheetGrid: React.FC<Readonly<SpreadsheetGridProps>> = ({
  editor,
  isDark,
  t,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // テーブルデータを同期的に取得して初期値にする
  const initialTableData = useRef(() => {
    let tableNode: PMNode | null = null;
    editor.state.doc.descendants((node) => {
      if (tableNode) return false;
      if (node.type.name === "table") { tableNode = node; return false; }
    });
    if (!tableNode) return { rows: 1, cols: 1, data: [] as string[][] };
    const { data, range } = extractTableData(tableNode);
    return { rows: range.rows, cols: range.cols, data };
  }).current();

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

  const { syncCellToProseMirror } = useSpreadsheetSync({
    editor,
    initGrid,
    setDataRange,
  });

  const [editing, setEditing] = useState<CellEditState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
    null,
  );
  const [dragState, setDragState] = useState<{
    type: "row" | "col";
    sourceIndex: number;
    targetIndex: number | null;
  } | null>(null);

  // --- Theme colors ---
  const primaryColor = isDark ? "#5b9bd5" : "#1976d2";
  const headerBg = isDark
    ? "rgba(255,255,255,0.05)"
    : "rgba(0,0,0,0.04)";
  const selectedBg = isDark
    ? "rgba(91,155,213,0.15)"
    : "rgba(25,118,210,0.08)";
  const borderColor = isDark
    ? "rgba(255,255,255,0.12)"
    : "rgba(0,0,0,0.12)";

  // --- Selection helpers ---
  const isCellSelected = useCallback(
    (row: number, col: number): boolean => {
      if (!selection) return false;
      switch (selection.type) {
        case "cell":
          return selection.row === row && selection.col === col;
        case "row":
          return selection.row === row;
        case "col":
          return selection.col === col;
        case "range":
          return (
            row >= selection.startRow &&
            row <= selection.endRow &&
            col >= selection.startCol &&
            col <= selection.endCol
          );
      }
    },
    [selection],
  );

  const isRowSelected = useCallback(
    (row: number): boolean =>
      selection?.type === "row" && selection.row === row,
    [selection],
  );

  const isColSelected = useCallback(
    (col: number): boolean =>
      selection?.type === "col" && selection.col === col,
    [selection],
  );

  // --- Event handlers ---
  const handleCellSelect = useCallback(
    (row: number, col: number) => {
      setSelection({ type: "cell", row, col });
      setEditing(null);
    },
    [setSelection],
  );

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      setEditing({ row, col, value: grid[row][col] });
    },
    [grid],
  );

  const handleCharInput = useCallback(
    (row: number, col: number, char: string) => {
      setCellValue(row, col, char);
      if (isInDataRange(row, col, dataRange)) {
        syncCellToProseMirror(row, col, char);
      }
      setEditing({ row, col, value: char });
    },
    [setCellValue, dataRange, syncCellToProseMirror],
  );

  const handleCellCommit = useCallback(
    (row: number, col: number, value: string) => {
      setCellValue(row, col, value);
      if (isInDataRange(row, col, dataRange)) {
        syncCellToProseMirror(row, col, value);
      }
      setEditing(null);
    },
    [setCellValue, dataRange, syncCellToProseMirror],
  );

  const handleCellCancel = useCallback(() => {
    setEditing(null);
  }, []);

  const handleKeyNavigation = useCallback(
    (key: string, shiftKey: boolean) => {
      if (!selection) return;

      let row =
        selection.type === "cell"
          ? selection.row
          : selection.type === "row"
            ? selection.row
            : 0;
      let col =
        selection.type === "cell"
          ? selection.col
          : selection.type === "col"
            ? selection.col
            : 0;

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

  const handleRowSelect = useCallback(
    (row: number) => {
      setSelection({ type: "row", row });
      setEditing(null);
    },
    [setSelection],
  );

  const handleColSelect = useCallback(
    (col: number) => {
      setSelection({ type: "col", col });
      setEditing(null);
    },
    [setSelection],
  );

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, row: number) => {
      e.preventDefault();
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "row", index: row },
      });
    },
    [],
  );

  const handleColContextMenu = useCallback(
    (e: React.MouseEvent, col: number) => {
      e.preventDefault();
      setContextMenu({
        anchorX: e.clientX,
        anchorY: e.clientY,
        target: { type: "col", index: col },
      });
    },
    [],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // --- Drag-and-drop handlers ---
  const handleDragStart = useCallback(
    (type: "row" | "col", index: number, e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      setDragState({ type, sourceIndex: index, targetIndex: null });
    },
    [],
  );

  const handleDragOver = useCallback(
    (type: "row" | "col", index: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragState((prev) =>
        prev?.type === type ? { ...prev, targetIndex: index } : prev,
      );
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDrop = useCallback(
    (type: "row" | "col", targetIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      const sourceIndex = Number.parseInt(
        e.dataTransfer.getData("text/plain"),
        10,
      );
      if (Number.isNaN(sourceIndex) || sourceIndex === targetIndex) {
        setDragState(null);
        return;
      }

      if (type === "row") {
        swapRows(sourceIndex, targetIndex);
      } else {
        swapCols(sourceIndex, targetIndex);
      }
      setDragState(null);
    },
    [swapRows, swapCols],
  );

  // --- Data range border helpers ---
  const getDataRangeBorderRight = (
    row: number,
    col: number,
  ): string | undefined => {
    if (col === dataRange.cols - 1 && row < dataRange.rows) {
      return `3px solid ${primaryColor}`;
    }
    return undefined;
  };

  const getDataRangeBorderBottom = (
    row: number,
    col: number,
  ): string | undefined => {
    if (row === dataRange.rows - 1 && col < dataRange.cols) {
      return `3px solid ${primaryColor}`;
    }
    return undefined;
  };

  const getDataRangeBorderLeft = (
    row: number,
    col: number,
  ): string | undefined => {
    if (col === 0 && row < dataRange.rows) {
      return `3px solid ${primaryColor}`;
    }
    return undefined;
  };

  const getDataRangeBorderTop = (
    row: number,
    col: number,
  ): string | undefined => {
    if (row === 0 && col < dataRange.cols) {
      return `3px solid ${primaryColor}`;
    }
    return undefined;
  };

  // --- Column headers ---
  const columnHeaders = Array.from({ length: GRID_COLS }, (_, col) => {
    const inDataTop = col < dataRange.cols;
    const isSelected = isColSelected(col);
    const isColDropTarget =
      dragState?.type === "col" && dragState.targetIndex === col;
    return (
      <Box
        component="th"
        key={col}
        draggable
        onClick={() => handleColSelect(col)}
        onContextMenu={(e: React.MouseEvent) => handleColContextMenu(e, col)}
        onDragStart={(e: React.DragEvent) => handleDragStart("col", col, e)}
        onDragOver={(e: React.DragEvent) => handleDragOver("col", col, e)}
        onDrop={(e: React.DragEvent) => handleDrop("col", col, e)}
        onDragEnd={handleDragEnd}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          width: 100,
          minWidth: 100,
          height: 28,
          fontSize: 12,
          fontWeight: 600,
          textAlign: "center",
          lineHeight: "28px",
          background: isSelected ? selectedBg : headerBg,
          borderRight: "none",
          borderBottom: inDataTop
            ? `3px solid ${primaryColor}`
            : `1px solid ${borderColor}`,
          borderTop: "none",
          borderLeft: isColDropTarget
            ? `3px solid ${primaryColor}`
            : "none",
          cursor: "grab",
          userSelect: "none",
          boxSizing: "border-box",
        }}
      >
        {columnLabel(col)}
      </Box>
    );
  });

  // --- Rows ---
  const rows = Array.from({ length: GRID_ROWS }, (_, row) => {
    const inDataLeft = row < dataRange.rows;
    const isRowSel = isRowSelected(row);
    const isRowDropTarget =
      dragState?.type === "row" && dragState.targetIndex === row;
    return (
      <Box component="tr" key={row}>
        {/* Row number cell */}
        <Box
          component="td"
          draggable
          onClick={() => handleRowSelect(row)}
          onContextMenu={(e: React.MouseEvent) =>
            handleRowContextMenu(e, row)
          }
          onDragStart={(e: React.DragEvent) => handleDragStart("row", row, e)}
          onDragOver={(e: React.DragEvent) => handleDragOver("row", row, e)}
          onDrop={(e: React.DragEvent) => handleDrop("row", row, e)}
          onDragEnd={handleDragEnd}
          sx={{
            position: "sticky",
            left: 0,
            zIndex: 1,
            width: 40,
            minWidth: 40,
            height: 28,
            fontSize: 12,
            fontWeight: 600,
            textAlign: "center",
            lineHeight: "28px",
            background: isRowSel ? selectedBg : headerBg,
            borderRight: inDataLeft
              ? `3px solid ${primaryColor}`
              : `1px solid ${borderColor}`,
            borderBottom: "none",
            borderLeft: "none",
            borderTop: isRowDropTarget
              ? `3px solid ${primaryColor}`
              : "none",
            cursor: "grab",
            userSelect: "none",
            boxSizing: "border-box",
          }}
        >
          {row + 1}
        </Box>
        {/* Data cells */}
        {Array.from({ length: GRID_COLS }, (_, col) => {
          const isSelected = isCellSelected(row, col);
          const isEditing =
            editing !== null &&
            editing.row === row &&
            editing.col === col;
          const inRange = isInDataRange(row, col, dataRange);
          const drRight = getDataRangeBorderRight(row, col);
          const drBottom = getDataRangeBorderBottom(row, col);
          const drLeft = getDataRangeBorderLeft(row, col);
          const drTop = getDataRangeBorderTop(row, col);
          const rowSelected = isRowSelected(row);
          const colSelected = isColSelected(col);

          return (
            <Box
              component="td"
              key={col}
              sx={{
                padding: 0,
                position: "relative",
                minWidth: 80,
                borderRight: drRight ?? "none",
                borderBottom: drBottom ?? "none",
                borderLeft: drLeft ?? "none",
                borderTop: drTop ?? "none",
                background:
                  rowSelected || colSelected ? selectedBg : undefined,
              }}
            >
              <SpreadsheetCell
                value={grid[row][col]}
                isSelected={isSelected}
                isEditing={isEditing}
                isInRange={inRange}
                onSelect={() => handleCellSelect(row, col)}
                onDoubleClick={() => handleCellDoubleClick(row, col)}
                onCommit={(value: string) =>
                  handleCellCommit(row, col, value)
                }
                onCancel={handleCellCancel}
                onKeyNavigation={handleKeyNavigation}
                onCharInput={(char: string) =>
                  handleCharInput(row, col, char)
                }
                isDark={isDark}
              />
            </Box>
          );
        })}
      </Box>
    );
  });

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
      <Box
        component="table"
        sx={{
          borderCollapse: "separate",
          borderSpacing: 0,
          tableLayout: "fixed",
        }}
      >
        <Box component="thead">
          <Box component="tr">
            {/* Top-left corner cell */}
            <Box
              component="th"
              sx={{
                position: "sticky",
                top: 0,
                left: 0,
                zIndex: 3,
                width: 40,
                minWidth: 40,
                height: 28,
                background: headerBg,
                borderRight: `1px solid ${borderColor}`,
                borderBottom: `1px solid ${borderColor}`,
                borderLeft: "none",
                borderTop: "none",
                boxSizing: "border-box",
              }}
            />
            {columnHeaders}
          </Box>
        </Box>
        <Box component="tbody">{rows}</Box>
      </Box>

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
