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
  /** 複数の変更を 1 つの undo 単位にまとめて実行する（ペースト・フィル・範囲クリア等）。 */
  transact(fn: () => void): void;
  /** state 外で保持するレイアウト（行高/列幅等）を履歴に含めるためのフックを登録する。 */
  setHistoryExtra(capture: () => unknown, restore: (extra: unknown) => void): void;
  /** 非同期操作（ドラッグ等）の開始時に現在状態を退避する。 */
  beginHistoryPoint(): void;
  /** beginHistoryPoint の退避を、変更があった場合のみ 1 つの undo 単位として確定する。 */
  commitHistoryPoint(changed: boolean): void;
  /** 直前の内容変更（grid / alignments / dataRange）を取り消す。取り消せたら true。 */
  undo(): boolean;
  /** undo を取り消す（やり直す）。やり直せたら true。 */
  redo(): boolean;
  /** undo/redo 履歴をクリアする（外部からの再シードなど baseline リセット時）。 */
  resetHistory(): void;
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

  // ---- undo / redo 履歴（grid / alignments / dataRange + 任意の extra のスナップショット） ----
  interface Snapshot {
    grid: string[][];
    alignments: CellAlign[][];
    dataRange: DataRange;
    /** state 外で保持されるレイアウト等（行高/列幅など）。capture/restore フックで授受する。 */
    extra?: unknown;
  }
  const HISTORY_LIMIT = 100;
  let past: Snapshot[] = [];
  let futureStack: Snapshot[] = [];
  let batchDepth = 0;
  // batch 中、最初の実変更時にだけ退避するスナップショット（無変更 transact の phantom 履歴を防ぐ）。
  let pendingSnapshot: Snapshot | null = null;
  // ドラッグ等の非同期操作用に begin で退避するスナップショット。
  let manualSnapshot: Snapshot | null = null;
  // state 外のレイアウト（行高/列幅）を履歴に含めるためのフック。
  let captureExtra: (() => unknown) | null = null;
  let restoreExtra: ((extra: unknown) => void) | null = null;

  const pushPast = (s: Snapshot): void => {
    past.push(s);
    if (past.length > HISTORY_LIMIT) past.shift();
    futureStack = [];
  };

  const snapshot = (): Snapshot => ({
    grid: grid.map((r) => [...r]),
    alignments: alignments.map((r) => [...r]),
    dataRange: { ...dataRange },
    extra: captureExtra?.(),
  });

  const restore = (s: Snapshot): void => {
    grid = s.grid.map((r) => [...r]);
    alignments = s.alignments.map((r) => [...r]);
    dataRange = { ...s.dataRange };
    restoreExtra?.(s.extra);
  };

  /** 実変更の直前に呼ぶ。batch 中はスナップショットを退避し、commit 時に 1 回だけ記録する。
   *  無変更（同値 no-op で recordHistory に到達しない）の transact は履歴を作らない。 */
  const recordHistory = (): void => {
    if (batchDepth > 0) {
      if (pendingSnapshot === null) pendingSnapshot = snapshot();
      return;
    }
    pushPast(snapshot());
  };

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
      if (grid[row][col] === value) return; // 同値は no-op（履歴も作らない）
      recordHistory();
      grid[row][col] = value;
      contentChanged();
    },
    setDataRange(range) {
      if (dataRange.rows === range.rows && dataRange.cols === range.cols) return; // 無変更は no-op
      recordHistory();
      dataRange = range;
      contentChanged();
    },
    setSelection(sel) {
      // 選択は内容ではないため履歴に積まない。
      selection = sel;
      params.onChange();
    },
    setCellAlign(row, col, align) {
      if (alignments[row] === undefined) return;
      recordHistory();
      alignments[row][col] = align;
      contentChanged();
    },
    setAlignments(aligns) {
      recordHistory();
      alignments = aligns;
      contentChanged();
    },
    initGrid(data) {
      recordHistory();
      grid = createEmptyGrid(GRID_ROWS, GRID_COLS);
      for (let r = 0; r < data.length && r < GRID_ROWS; r++) {
        for (let c = 0; c < data[r].length && c < GRID_COLS; c++) {
          grid[r][c] = data[r][c];
        }
      }
      contentChanged();
    },
    insertRow(atIndex) {
      recordHistory();
      grid.splice(atIndex, 0, Array.from({ length: GRID_COLS }, () => ""));
      grid = grid.slice(0, GRID_ROWS);
      contentChanged();
    },
    deleteRow(atIndex) {
      recordHistory();
      grid.splice(atIndex, 1);
      grid.push(Array.from({ length: GRID_COLS }, () => ""));
      contentChanged();
    },
    insertCol(atIndex) {
      recordHistory();
      grid = grid.map((row) => {
        const next = [...row];
        next.splice(atIndex, 0, "");
        return next.slice(0, GRID_COLS);
      });
      contentChanged();
    },
    deleteCol(atIndex) {
      recordHistory();
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
      recordHistory();
      [grid[a], grid[b]] = [grid[b], grid[a]];
      contentChanged();
    },
    swapCols(a, b) {
      recordHistory();
      for (const row of grid) {
        if (row[a] === undefined || row[b] === undefined) continue;
        [row[a], row[b]] = [row[b], row[a]];
      }
      contentChanged();
    },
    transact(fn) {
      const outer = batchDepth === 0;
      if (outer) pendingSnapshot = null;
      batchDepth++;
      try {
        fn();
      } finally {
        batchDepth--;
        // 実変更があった場合のみ（pendingSnapshot が積まれた場合のみ）履歴に記録する。
        if (outer && pendingSnapshot !== null) {
          pushPast(pendingSnapshot);
          pendingSnapshot = null;
        }
      }
    },
    setHistoryExtra(capture, restore) {
      captureExtra = capture;
      restoreExtra = restore;
    },
    beginHistoryPoint() {
      manualSnapshot = snapshot();
    },
    commitHistoryPoint(changed) {
      if (changed && manualSnapshot !== null) pushPast(manualSnapshot);
      manualSnapshot = null;
    },
    undo() {
      const prev = past.pop();
      if (prev === undefined) return false;
      futureStack.push(snapshot());
      restore(prev);
      contentChanged();
      return true;
    },
    redo() {
      const next = futureStack.pop();
      if (next === undefined) return false;
      past.push(snapshot());
      restore(next);
      contentChanged();
      return true;
    },
    resetHistory() {
      past = [];
      futureStack = [];
    },
  };
}
