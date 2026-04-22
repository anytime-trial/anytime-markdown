import {
  columnLabel,
  createEmptyGrid,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  isInDataRange,
} from "../utils/gridUtils";

describe("gridUtils", () => {
  describe("columnLabel", () => {
    test("0 → A", () => expect(columnLabel(0)).toBe("A"));
    test("1 → B", () => expect(columnLabel(1)).toBe("B"));
    test("19 → T", () => expect(columnLabel(19)).toBe("T"));
    test("25 → Z", () => expect(columnLabel(25)).toBe("Z"));
  });

  describe("createEmptyGrid", () => {
    test("51×15 の空グリッドを生成", () => {
      const grid = createEmptyGrid();
      expect(grid.length).toBe(DEFAULT_GRID_ROWS);
      expect(grid[0].length).toBe(DEFAULT_GRID_COLS);
      expect(grid[0][0]).toBe("");
      expect(grid[DEFAULT_GRID_ROWS - 1][DEFAULT_GRID_COLS - 1]).toBe("");
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
