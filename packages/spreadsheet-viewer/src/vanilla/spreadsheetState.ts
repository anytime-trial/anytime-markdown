import type {
  CellAlign,
  DataRange,
  SpreadsheetSelection,
} from "@anytime-markdown/spreadsheet-core";
import {
  createEmptyGrid,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
} from "@anytime-markdown/spreadsheet-core";

/**
 * React hooks/useSpreadsheetState の vanilla 版。
 * grid / alignments / dataRange / selection を closure に保持し、変更時に onChange を 1 回呼ぶ。
 * 行列の挿入・削除・入替のセマンティクス（グリッド外あふれの切り捨て・末尾空行補充）は
 * React 版と同一。
 */

export interface SpreadsheetStateParams {
  initialRows: number;
  initialCols: number;
  initialData?: string[][];
  initialAlignments?: CellAlign[][];
  gridRows?: number;
  gridCols?: number;
  /** いずれかの状態が変化した後に 1 回呼ばれる（再描画 trigger）。 */
  onChange: () => void;
  /** grid / alignments / dataRange の内容変化（selection 以外）で呼ばれる（dirty trigger）。 */
  onContentChange?: () => void;
}

export interface SpreadsheetState {
  readonly grid: string[][];
  readonly alignments: CellAlign[][];
  readonly dataRange: DataRange;
  readonly selection: SpreadsheetSelection | null;
  setCellValue(row: number, col: number, value: string): void;
  setDataRange(range: DataRange): void;
  setSelection(sel: SpreadsheetSelection | null): void;
  setCellAlign(row: number, col: number, align: CellAlign): void;
  setAlignments(aligns: CellAlign[][]): void;
  initGrid(data: string[][]): void;
  insertRow(atIndex: number): void;
  deleteRow(atIndex: number): void;
  insertCol(atIndex: number): void;
  deleteCol(atIndex: number): void;
  swapRows(a: number, b: number): void;
  swapCols(a: number, b: number): void;
}

export function createSpreadsheetState(params: SpreadsheetStateParams): SpreadsheetState {
  const GRID_ROWS = params.gridRows ?? DEFAULT_GRID_ROWS;
  const GRID_COLS = params.gridCols ?? DEFAULT_GRID_COLS;

  let grid: string[][] = createEmptyGrid(GRID_ROWS, GRID_COLS);
  if (params.initialData) {
    for (let r = 0; r < params.initialData.length && r < GRID_ROWS; r++) {
      for (let c = 0; c < params.initialData[r].length && c < GRID_COLS; c++) {
        grid[r][c] = params.initialData[r][c];
      }
    }
  }
  let alignments: CellAlign[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from<CellAlign>({ length: GRID_COLS }).fill(null),
  );
  if (params.initialAlignments) {
    for (let r = 0; r < params.initialAlignments.length && r < GRID_ROWS; r++) {
      for (let c = 0; c < params.initialAlignments[r].length && c < GRID_COLS; c++) {
        alignments[r][c] = params.initialAlignments[r][c];
      }
    }
  }
  let dataRange: DataRange = { rows: params.initialRows, cols: params.initialCols };
  let selection: SpreadsheetSelection | null = null;

  const contentChanged = (): void => {
    params.onContentChange?.();
    params.onChange();
  };

  return {
    get grid() {
      return grid;
    },
    get alignments() {
      return alignments;
    },
    get dataRange() {
      return dataRange;
    },
    get selection() {
      return selection;
    },
    setCellValue(row, col, value) {
      if (grid[row] === undefined || grid[row][col] === undefined) return;
      grid[row][col] = value;
      contentChanged();
    },
    setDataRange(range) {
      dataRange = range;
      contentChanged();
    },
    setSelection(sel) {
      selection = sel;
      params.onChange();
    },
    setCellAlign(row, col, align) {
      if (alignments[row] === undefined) return;
      alignments[row][col] = align;
      contentChanged();
    },
    setAlignments(aligns) {
      alignments = aligns;
      contentChanged();
    },
    initGrid(data) {
      grid = createEmptyGrid(GRID_ROWS, GRID_COLS);
      for (let r = 0; r < data.length && r < GRID_ROWS; r++) {
        for (let c = 0; c < data[r].length && c < GRID_COLS; c++) {
          grid[r][c] = data[r][c];
        }
      }
      contentChanged();
    },
    insertRow(atIndex) {
      grid.splice(atIndex, 0, Array.from({ length: GRID_COLS }, () => ""));
      grid = grid.slice(0, GRID_ROWS);
      contentChanged();
    },
    deleteRow(atIndex) {
      grid.splice(atIndex, 1);
      grid.push(Array.from({ length: GRID_COLS }, () => ""));
      contentChanged();
    },
    insertCol(atIndex) {
      grid = grid.map((row) => {
        const next = [...row];
        next.splice(atIndex, 0, "");
        return next.slice(0, GRID_COLS);
      });
      contentChanged();
    },
    deleteCol(atIndex) {
      grid = grid.map((row) => {
        const next = [...row];
        next.splice(atIndex, 1);
        next.push("");
        return next;
      });
      contentChanged();
    },
    swapRows(a, b) {
      if (grid[a] === undefined || grid[b] === undefined) return;
      [grid[a], grid[b]] = [grid[b], grid[a]];
      contentChanged();
    },
    swapCols(a, b) {
      for (const row of grid) {
        if (row[a] === undefined || row[b] === undefined) continue;
        [row[a], row[b]] = [row[b], row[a]];
      }
      contentChanged();
    },
  };
}
