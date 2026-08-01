/**
 * boxTableToMarkdown.ts coverage tests
 * Targets: extractCells non-empty first/last (line 80, 81),
 *          formatTable empty rows (line 87),
 *          table followed by non-table text (line 23)
 */
import { boxTableToMarkdown, containsBoxTable } from "../utils/boxTableToMarkdown";

describe("boxTableToMarkdown coverage", () => {
  it("containsBoxTable returns true for box chars", () => {
    expect(containsBoxTable("┌──┐")).toBe(true);
    expect(containsBoxTable("regular text")).toBe(false);
  });

  it("converts simple box table to markdown", () => {
    const input = `┌───┬───┐
│ A │ B │
├───┼───┤
│ 1 │ 2 │
└───┴───┘`;
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| A");
    expect(result).toContain("| 1");
  });

  it("handles double-line box table with ║", () => {
    const input = `╔═══╦═══╗
║ X ║ Y ║
╠═══╬═══╣
║ 3 ║ 4 ║
╚═══╩═══╝`;
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| X");
    expect(result).toContain("| 3");
  });

  it("handles box table followed by regular text", () => {
    const input = `┌───┬───┐
│ A │ B │
└───┴───┘
Some text after`;
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| A");
    expect(result).toContain("Some text after");
  });

  it("handles box table followed by blank line", () => {
    const input = `┌───┬───┐
│ A │ B │
├───┼───┤
│ 1 │ 2 │

Regular text`;
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| A");
    expect(result).toContain("Regular text");
  });

  it("handles data line without leading/trailing separator", () => {
    const input = `┌───┬───┐
 X │ Y
└───┴───┘`;
    const result = boxTableToMarkdown(input);
    // Should still process
    expect(result).toBeDefined();
  });

  it("returns original text when no box table present", () => {
    const input = "Just regular text\nwith multiple lines";
    expect(boxTableToMarkdown(input)).toBe(input);
  });

  it("handles empty input", () => {
    expect(boxTableToMarkdown("")).toBe("");
  });

  it("handles single-row box table", () => {
    const input = `┌───┐
│ A │
└───┘`;
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| A");
  });

  it("handles table with uneven columns", () => {
    const input = `┌───┬───┬───┐
│ A │ B │ C │
├───┼───┼───┤
│ 1 │ 2 │
└───┴───┴───┘`;
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| A");
  });
});
