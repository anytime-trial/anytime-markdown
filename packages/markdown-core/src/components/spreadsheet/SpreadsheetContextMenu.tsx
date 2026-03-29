import React, { useCallback } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import FilterListIcon from "@mui/icons-material/FilterList";
import type { Editor } from "@tiptap/react";
import { moveTableRow, moveTableColumn } from "../../utils/tableHelpers";
import type { ContextMenuState, DataRange } from "./spreadsheetTypes";

interface SpreadsheetContextMenuProps {
  readonly contextMenu: ContextMenuState;
  readonly dataRange: DataRange;
  readonly grid: string[][];
  readonly editor: Editor;
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

export const SpreadsheetContextMenu = React.memo(
  function SpreadsheetContextMenu({
    contextMenu,
    dataRange,
    grid,
    editor,
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
    // row/col ハンドラ用に index を持つ target を抽出（cell の場合は使われない）
    const indexTarget = target.type !== "cell" ? target : null;

    const handleInsertRowAbove = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      onInsertRow(indexTarget.index);
      if (inData) {
        editor.chain().addRowBefore().run();
        setDataRange({ ...dataRange, rows: dataRange.rows + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, editor, onInsertRow, setDataRange, onClose]);

    const handleInsertRowBelow = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      onInsertRow(indexTarget.index + 1);
      if (inData) {
        editor.chain().addRowAfter().run();
        setDataRange({ ...dataRange, rows: dataRange.rows + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, editor, onInsertRow, setDataRange, onClose]);

    const handleDeleteRow = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      onDeleteRow(indexTarget.index);
      if (inData) {
        editor.chain().deleteRow().run();
        setDataRange({
          ...dataRange,
          rows: Math.max(1, dataRange.rows - 1),
        });
      }
      onClose();
    }, [indexTarget, dataRange, editor, onDeleteRow, setDataRange, onClose]);

    const handleMoveRowUp = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      if (inData) {
        moveTableRow(editor, "up");
      } else {
        onSwapRows(indexTarget.index, indexTarget.index - 1);
      }
      onClose();
    }, [indexTarget, dataRange, editor, onSwapRows, onClose]);

    const handleMoveRowDown = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.rows;
      if (inData) {
        moveTableRow(editor, "down");
      } else {
        onSwapRows(indexTarget.index, indexTarget.index + 1);
      }
      onClose();
    }, [indexTarget, dataRange, editor, onSwapRows, onClose]);

    const handleInsertColLeft = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      onInsertCol(indexTarget.index);
      if (inData) {
        editor.chain().addColumnBefore().run();
        setDataRange({ ...dataRange, cols: dataRange.cols + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, editor, onInsertCol, setDataRange, onClose]);

    const handleInsertColRight = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      onInsertCol(indexTarget.index + 1);
      if (inData) {
        editor.chain().addColumnAfter().run();
        setDataRange({ ...dataRange, cols: dataRange.cols + 1 });
      }
      onClose();
    }, [indexTarget, dataRange, editor, onInsertCol, setDataRange, onClose]);

    const handleDeleteCol = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      onDeleteCol(indexTarget.index);
      if (inData) {
        editor.chain().deleteColumn().run();
        setDataRange({
          ...dataRange,
          cols: Math.max(1, dataRange.cols - 1),
        });
      }
      onClose();
    }, [indexTarget, dataRange, editor, onDeleteCol, setDataRange, onClose]);

    const handleMoveColLeft = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      if (inData) {
        moveTableColumn(editor, "left");
      } else {
        onSwapCols(indexTarget.index, indexTarget.index - 1);
      }
      onClose();
    }, [indexTarget, dataRange, editor, onSwapCols, onClose]);

    const handleMoveColRight = useCallback(() => {
      if (!indexTarget) return;
      const inData = indexTarget.index < dataRange.cols;
      if (inData) {
        moveTableColumn(editor, "right");
      } else {
        onSwapCols(indexTarget.index, indexTarget.index + 1);
      }
      onClose();
    }, [indexTarget, dataRange, editor, onSwapCols, onClose]);

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
      navigator.clipboard.writeText(rangesToTsv(range)).catch(() => {/* ignore */});
      onClose();
    }, [getTargetCells, rangesToTsv, onClose]);

    const handleCut = useCallback(() => {
      const range = getTargetCells();
      if (!range) return;
      navigator.clipboard.writeText(rangesToTsv(range)).catch(() => {/* ignore */});
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
      }).catch(() => {/* ignore */});
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
