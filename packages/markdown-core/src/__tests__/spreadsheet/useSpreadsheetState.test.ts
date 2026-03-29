import { renderHook, act } from "@testing-library/react";
import { useSpreadsheetState } from "../../components/spreadsheet/useSpreadsheetState";
import {
  GRID_ROWS,
  GRID_COLS,
} from "../../components/spreadsheet/spreadsheetUtils";

describe("useSpreadsheetState", () => {
  const DEFAULT_ROWS = 5;
  const DEFAULT_COLS = 3;

  function setup(initialRows = DEFAULT_ROWS, initialCols = DEFAULT_COLS) {
    return renderHook(() =>
      useSpreadsheetState({ initialRows, initialCols }),
    );
  }

  describe("initial state", () => {
    it("should create an empty grid of GRID_ROWS × GRID_COLS", () => {
      const { result } = setup();
      expect(result.current.grid).toHaveLength(GRID_ROWS);
      for (const row of result.current.grid) {
        expect(row).toHaveLength(GRID_COLS);
        expect(row.every((cell) => cell === "")).toBe(true);
      }
    });

    it("should set dataRange from initialRows and initialCols", () => {
      const { result } = setup(8, 4);
      expect(result.current.dataRange).toEqual({ rows: 8, cols: 4 });
    });

    it("should start with selection as null", () => {
      const { result } = setup();
      expect(result.current.selection).toBeNull();
    });
  });

  describe("setCellValue", () => {
    it("should update a specific cell", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(2, 3, "hello");
      });
      expect(result.current.grid[2][3]).toBe("hello");
    });

    it("should not affect other cells", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "X");
      });
      expect(result.current.grid[0][1]).toBe("");
      expect(result.current.grid[1][0]).toBe("");
    });
  });

  describe("setSelection", () => {
    it("should set cell selection", () => {
      const { result } = setup();
      act(() => {
        result.current.setSelection({ type: "cell", row: 1, col: 2 });
      });
      expect(result.current.selection).toEqual({
        type: "cell",
        row: 1,
        col: 2,
      });
    });

    it("should set row selection", () => {
      const { result } = setup();
      act(() => {
        result.current.setSelection({ type: "row", start: 5, end: 5 });
      });
      expect(result.current.selection).toEqual({ type: "row", start: 5, end: 5 });
    });

    it("should set col selection", () => {
      const { result } = setup();
      act(() => {
        result.current.setSelection({ type: "col", start: 3, end: 3 });
      });
      expect(result.current.selection).toEqual({ type: "col", start: 3, end: 3 });
    });

    it("should clear selection with null", () => {
      const { result } = setup();
      act(() => {
        result.current.setSelection({ type: "cell", row: 0, col: 0 });
      });
      act(() => {
        result.current.setSelection(null);
      });
      expect(result.current.selection).toBeNull();
    });
  });

  describe("setDataRange", () => {
    it("should update data range", () => {
      const { result } = setup();
      act(() => {
        result.current.setDataRange({ rows: 10, cols: 6 });
      });
      expect(result.current.dataRange).toEqual({ rows: 10, cols: 6 });
    });
  });

  describe("initGrid", () => {
    it("should populate grid from 2D array", () => {
      const { result } = setup();
      const data = [
        ["A", "B", "C"],
        ["D", "E", "F"],
      ];
      act(() => {
        result.current.initGrid(data);
      });
      expect(result.current.grid[0][0]).toBe("A");
      expect(result.current.grid[0][2]).toBe("C");
      expect(result.current.grid[1][0]).toBe("D");
      expect(result.current.grid[1][2]).toBe("F");
    });

    it("should keep remaining cells empty", () => {
      const { result } = setup();
      const data = [["X"]];
      act(() => {
        result.current.initGrid(data);
      });
      expect(result.current.grid[0][0]).toBe("X");
      expect(result.current.grid[0][1]).toBe("");
      expect(result.current.grid[1][0]).toBe("");
    });

    it("should maintain GRID_ROWS × GRID_COLS dimensions", () => {
      const { result } = setup();
      act(() => {
        result.current.initGrid([["a", "b"]]);
      });
      expect(result.current.grid).toHaveLength(GRID_ROWS);
      for (const row of result.current.grid) {
        expect(row).toHaveLength(GRID_COLS);
      }
    });
  });

  describe("insertRow", () => {
    it("should insert an empty row at the specified index", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "row0");
        result.current.setCellValue(1, 0, "row1");
      });
      act(() => {
        result.current.insertRow(1);
      });
      expect(result.current.grid[0][0]).toBe("row0");
      expect(result.current.grid[1][0]).toBe("");
      expect(result.current.grid[2][0]).toBe("row1");
    });

    it("should maintain GRID_ROWS length", () => {
      const { result } = setup();
      act(() => {
        result.current.insertRow(0);
      });
      expect(result.current.grid).toHaveLength(GRID_ROWS);
    });

    it("should shift rows down and drop last row", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(GRID_ROWS - 1, 0, "lastRow");
      });
      act(() => {
        result.current.insertRow(0);
      });
      // Last row data is dropped
      expect(result.current.grid[GRID_ROWS - 1][0]).toBe("");
    });
  });

  describe("deleteRow", () => {
    it("should remove the row and shift up", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "row0");
        result.current.setCellValue(1, 0, "row1");
        result.current.setCellValue(2, 0, "row2");
      });
      act(() => {
        result.current.deleteRow(1);
      });
      expect(result.current.grid[0][0]).toBe("row0");
      expect(result.current.grid[1][0]).toBe("row2");
    });

    it("should append empty row at the end", () => {
      const { result } = setup();
      act(() => {
        result.current.deleteRow(0);
      });
      expect(result.current.grid).toHaveLength(GRID_ROWS);
      expect(
        result.current.grid[GRID_ROWS - 1].every((c) => c === ""),
      ).toBe(true);
    });
  });

  describe("insertCol", () => {
    it("should insert empty col at specified index", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "c0");
        result.current.setCellValue(0, 1, "c1");
      });
      act(() => {
        result.current.insertCol(1);
      });
      expect(result.current.grid[0][0]).toBe("c0");
      expect(result.current.grid[0][1]).toBe("");
      expect(result.current.grid[0][2]).toBe("c1");
    });

    it("should maintain GRID_COLS length", () => {
      const { result } = setup();
      act(() => {
        result.current.insertCol(0);
      });
      for (const row of result.current.grid) {
        expect(row).toHaveLength(GRID_COLS);
      }
    });
  });

  describe("deleteCol", () => {
    it("should remove col and shift left", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "c0");
        result.current.setCellValue(0, 1, "c1");
        result.current.setCellValue(0, 2, "c2");
      });
      act(() => {
        result.current.deleteCol(1);
      });
      expect(result.current.grid[0][0]).toBe("c0");
      expect(result.current.grid[0][1]).toBe("c2");
    });

    it("should append empty string at end of each row", () => {
      const { result } = setup();
      act(() => {
        result.current.deleteCol(0);
      });
      for (const row of result.current.grid) {
        expect(row).toHaveLength(GRID_COLS);
        expect(row[GRID_COLS - 1]).toBe("");
      }
    });
  });

  describe("swapRows", () => {
    it("should swap two rows", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "rowA");
        result.current.setCellValue(3, 0, "rowB");
      });
      act(() => {
        result.current.swapRows(0, 3);
      });
      expect(result.current.grid[0][0]).toBe("rowB");
      expect(result.current.grid[3][0]).toBe("rowA");
    });
  });

  describe("swapCols", () => {
    it("should swap column values across all rows", () => {
      const { result } = setup();
      act(() => {
        result.current.setCellValue(0, 0, "A");
        result.current.setCellValue(0, 2, "C");
        result.current.setCellValue(1, 0, "D");
        result.current.setCellValue(1, 2, "F");
      });
      act(() => {
        result.current.swapCols(0, 2);
      });
      expect(result.current.grid[0][0]).toBe("C");
      expect(result.current.grid[0][2]).toBe("A");
      expect(result.current.grid[1][0]).toBe("F");
      expect(result.current.grid[1][2]).toBe("D");
    });
  });
});
