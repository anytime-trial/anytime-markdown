import {
  columnLabel,
  createEmptyGrid,
  isInDataRange,
  GRID_ROWS,
  GRID_COLS,
} from "../../components/spreadsheet/spreadsheetUtils";

describe("spreadsheetUtils", () => {
  describe("columnLabel", () => {
    test("0 → A", () => expect(columnLabel(0)).toBe("A"));
    test("1 → B", () => expect(columnLabel(1)).toBe("B"));
    test("19 → T", () => expect(columnLabel(19)).toBe("T"));
    test("25 → Z", () => expect(columnLabel(25)).toBe("Z"));
  });

  describe("createEmptyGrid", () => {
    test("100×20 の空グリッドを生成", () => {
      const grid = createEmptyGrid();
      expect(grid.length).toBe(GRID_ROWS);
      expect(grid[0].length).toBe(GRID_COLS);
      expect(grid[0][0]).toBe("");
      expect(grid[99][19]).toBe("");
    });

    test("各行が独立した配列", () => {
      const grid = createEmptyGrid();
      grid[0][0] = "test";
      expect(grid[1][0]).toBe("");
    });
  });

  describe("isInDataRange", () => {
    const range = { rows: 3, cols: 2 };
    test("範囲内", () => expect(isInDataRange(0, 0, range)).toBe(true));
    test("範囲内の境界", () => expect(isInDataRange(2, 1, range)).toBe(true));
    test("行が範囲外", () => expect(isInDataRange(3, 0, range)).toBe(false));
    test("列が範囲外", () => expect(isInDataRange(0, 2, range)).toBe(false));
    test("負の値", () => expect(isInDataRange(-1, 0, range)).toBe(false));
  });
});
