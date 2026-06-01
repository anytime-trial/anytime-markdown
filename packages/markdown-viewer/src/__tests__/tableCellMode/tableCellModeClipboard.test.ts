import {
  cellContentToTsv,
  tsvToCellContent,
  parseClipboardTable,
} from "../../plugins/tableCellMode/tableCellModeClipboard";

// ----------------------------------------------------------------
// cellContentToTsv
// ----------------------------------------------------------------

describe("cellContentToTsv", () => {
  test("2D array to TSV", () => {
    expect(cellContentToTsv([["A1", "A2"], ["B1", "B2"]])).toBe(
      "A1\tA2\nB1\tB2",
    );
  });

  test("single cell", () => {
    expect(cellContentToTsv([["hello"]])).toBe("hello");
  });

  test("empty array", () => {
    expect(cellContentToTsv([])).toBe("");
  });

  test("single row with multiple columns", () => {
    expect(cellContentToTsv([["A", "B", "C"]])).toBe("A\tB\tC");
  });

  test("multiple rows with single column", () => {
    expect(cellContentToTsv([["A"], ["B"], ["C"]])).toBe("A\nB\nC");
  });

  test("cells with empty strings", () => {
    expect(cellContentToTsv([["", "B"], ["C", ""]])).toBe("\tB\nC\t");
  });
});

// ----------------------------------------------------------------
// tsvToCellContent
// ----------------------------------------------------------------

describe("tsvToCellContent", () => {
  test("TSV to 2D array", () => {
    expect(tsvToCellContent("A1\tA2\nB1\tB2")).toEqual([
      ["A1", "A2"],
      ["B1", "B2"],
    ]);
  });

  test("single cell", () => {
    expect(tsvToCellContent("hello")).toEqual([["hello"]]);
  });

  test("single row with tabs", () => {
    expect(tsvToCellContent("A\tB\tC")).toEqual([["A", "B", "C"]]);
  });

  test("multiple rows without tabs", () => {
    expect(tsvToCellContent("A\nB\nC")).toEqual([["A"], ["B"], ["C"]]);
  });

  test("empty cells", () => {
    expect(tsvToCellContent("\tB\nC\t")).toEqual([["", "B"], ["C", ""]]);
  });

  test("trailing newline is ignored", () => {
    expect(tsvToCellContent("A\tB\n")).toEqual([["A", "B"]]);
  });
});

// ----------------------------------------------------------------
// parseClipboardTable
// ----------------------------------------------------------------

describe("parseClipboardTable", () => {
  test("TSV detected", () => {
    expect(parseClipboardTable("A\tB\nC\tD", "")).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  test("no tab = null", () => {
    expect(parseClipboardTable("just text", "")).toBeNull();
  });

  test("single tab is detected as TSV", () => {
    expect(parseClipboardTable("A\tB", "")).toEqual([["A", "B"]]);
  });

  test("empty string returns null", () => {
    expect(parseClipboardTable("", "")).toBeNull();
  });
});
