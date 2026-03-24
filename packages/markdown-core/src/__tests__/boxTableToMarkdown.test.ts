import { boxTableToMarkdown, containsBoxTable } from "../utils/boxTableToMarkdown";

describe("containsBoxTable", () => {
  test("罫線文字を含むテキストを検出", () => {
    expect(containsBoxTable("┌──┬──┐")).toBe(true);
    expect(containsBoxTable("│ a │ b │")).toBe(true);
  });

  test("罫線文字を含まないテキスト", () => {
    expect(containsBoxTable("| a | b |")).toBe(false);
    expect(containsBoxTable("hello world")).toBe(false);
  });
});

describe("boxTableToMarkdown", () => {
  test("基本的な罫線テーブルを変換", () => {
    const input = [
      "┌────┬────┐",
      "│ A  │ B  │",
      "├────┼────┤",
      "│ c  │ d  │",
      "└────┴────┘",
    ].join("\n");

    const result = boxTableToMarkdown(input);
    const lines = result.split("\n");
    expect(lines[0]).toContain("| A");
    expect(lines[0]).toContain("B");
    expect(lines[1]).toMatch(/\| -+ \| -+ \|/);
    expect(lines[2]).toContain("| c");
    expect(lines[2]).toContain("d");
  });

  test("罫線テーブルの前後にテキストがある場合", () => {
    const input = [
      "before text",
      "┌──┬──┐",
      "│a │b │",
      "└──┴──┘",
      "after text",
    ].join("\n");

    const result = boxTableToMarkdown(input);
    expect(result).toContain("before text");
    expect(result).toContain("after text");
    expect(result).toContain("| a");
  });

  test("罫線文字を含まないテキストはそのまま返す", () => {
    const input = "| A | B |\n| --- | --- |\n| c | d |";
    expect(boxTableToMarkdown(input)).toBe(input);
  });

  test("Claude Code の出力テーブルを変換", () => {
    const input = [
      "  ┌──────────┬──────────────────┐",
      "  │ セクション │ 変更             │",
      "  ├──────────┼──────────────────┤",
      "  │ 2.2      │ スラッシュコマンド │",
      "  └──────────┴──────────────────┘",
    ].join("\n");

    const result = boxTableToMarkdown(input);
    const lines = result.split("\n");
    expect(lines[0]).toMatch(/^\| セクション/);
    expect(lines[1]).toMatch(/^\| -+/);
    expect(lines[2]).toMatch(/^\| 2.2/);
  });
});
