import { useCallback, useState } from "react";

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

interface UseSpreadsheetStateParams {
  readonly initialRows: number;
  readonly initialCols: number;
  readonly initialData?: string[][];
  readonly initialAlignments?: CellAlign[][];
  readonly gridRows?: number;
  readonly gridCols?: number;
}

interface UseSpreadsheetStateReturn {
  readonly grid: string[][];
  readonly alignments: CellAlign[][];
  readonly dataRange: DataRange;
  readonly selection: SpreadsheetSelection | null;
  readonly setCellValue: (row: number, col: number, value: string) => void;
  readonly setDataRange: (range: DataRange) => void;
  readonly setSelection: (sel: SpreadsheetSelection | null) => void;
  readonly setCellAlign: (row: number, col: number, align: CellAlign) => void;
  readonly setAlignments: (aligns: CellAlign[][]) => void;
  readonly initGrid: (data: string[][]) => void;
  readonly insertRow: (atIndex: number) => void;
  readonly deleteRow: (atIndex: number) => void;
  readonly insertCol: (atIndex: number) => void;
  readonly deleteCol: (atIndex: number) => void;
  readonly swapRows: (a: number, b: number) => void;
  readonly swapCols: (a: number, b: number) => void;
}

export function useSpreadsheetState({
  initialRows,
  initialCols,
  initialData,
  initialAlignments,
  gridRows: GRID_ROWS = DEFAULT_GRID_ROWS,
  gridCols: GRID_COLS = DEFAULT_GRID_COLS,
}: UseSpreadsheetStateParams): UseSpreadsheetStateReturn {
  const [grid, setGrid] = useState<string[][]>(() => {
    const g = createEmptyGrid(GRID_ROWS, GRID_COLS);
    if (initialData) {
      for (let r = 0; r < initialData.length && r < GRID_ROWS; r++) {
        for (let c = 0; c < initialData[r].length && c < GRID_COLS; c++) {
          g[r][c] = initialData[r][c];
        }
      }
    }
    return g;
  });
  const [dataRange, setDataRange] = useState<DataRange>({
    rows: initialRows,
    cols: initialCols,
  });
  const [selection, setSelection] = useState<SpreadsheetSelection | null>(
    null,
  );
  const [alignments, setAlignments] = useState<CellAlign[][]>(() => {
    const a = Array.from({ length: GRID_ROWS }, () =>
      Array.from<CellAlign>({ length: GRID_COLS }).fill(null),
    );
    if (initialAlignments) {
      for (let r = 0; r < initialAlignments.length && r < GRID_ROWS; r++) {
        for (let c = 0; c < initialAlignments[r].length && c < GRID_COLS; c++) {
          a[r][c] = initialAlignments[r][c];
        }
      }
    }
    return a;
  });

  const setCellAlign = useCallback((row: number, col: number, align: CellAlign) => {
    setAlignments((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = align;
      return next;
    });
  }, []);

  const setCellValue = useCallback(
    (row: number, col: number, value: string) => {
      setGrid((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = value;
        return next;
      });
    },
    [],
  );

  const initGrid = useCallback((data: string[][]) => {
    setGrid(() => {
      const next = createEmptyGrid(GRID_ROWS, GRID_COLS);
      for (let r = 0; r < data.length && r < GRID_ROWS; r++) {
        for (let c = 0; c < data[r].length && c < GRID_COLS; c++) {
          next[r][c] = data[r][c];
        }
      }
      return next;
    });
  }, [GRID_ROWS, GRID_COLS]);

  const insertRow = useCallback((atIndex: number) => {
    setGrid((prev) => {
      const next = [...prev];
      const emptyRow = Array.from({ length: GRID_COLS }, () => "");
      next.splice(atIndex, 0, emptyRow);
      return next.slice(0, GRID_ROWS);
    });
  }, [GRID_ROWS, GRID_COLS]);

  const deleteRow = useCallback((atIndex: number) => {
    setGrid((prev) => {
      const next = [...prev];
      next.splice(atIndex, 1);
      next.push(Array.from({ length: GRID_COLS }, () => ""));
      return next;
    });
  }, [GRID_COLS]);

  const insertCol = useCallback((atIndex: number) => {
    setGrid((prev) =>
      prev.map((row) => {
        const next = [...row];
        next.splice(atIndex, 0, "");
        return next.slice(0, GRID_COLS);
      }),
    );
  }, [GRID_COLS]);

  const deleteCol = useCallback((atIndex: number) => {
    setGrid((prev) =>
      prev.map((row) => {
        const next = [...row];
        next.splice(atIndex, 1);
        next.push("");
        return next;
      }),
    );
  }, []);

  const swapRows = useCallback((a: number, b: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }, []);

  const swapCols = useCallback((a: number, b: number) => {
    setGrid((prev) =>
      prev.map((row) => {
        const next = [...row];
        [next[a], next[b]] = [next[b], next[a]];
        return next;
      }),
    );
  }, []);

  return {
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
  };
}
