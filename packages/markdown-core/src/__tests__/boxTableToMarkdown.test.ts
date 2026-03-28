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

  test("テーブルの後に空行がある場合も正しく変換", () => {
    const input = [
      "┌──┬──┐",
      "│a │b │",
      "├──┼──┤",
      "│c │d │",
      "└──┴──┘",
      "",
      "text after",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    expect(result).toContain("text after");
    expect(result).toContain("| a");
  });

  test("テーブル終了後にテーブル外テキストが続く場合(空行なし)", () => {
    const input = [
      "┌──┬──┐",
      "│a │b │",
      "└──┴──┘",
      "non-table text",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    expect(result).toContain("non-table text");
    expect(result).toContain("| a");
  });

  test("末尾がテーブルで終わる場合", () => {
    const input = [
      "intro text",
      "┌──┬──┐",
      "│x │y │",
      "└──┴──┘",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    expect(result).toContain("intro text");
    expect(result).toContain("| x");
  });

  test("二重線(║)のデータ行を変換", () => {
    const input = [
      "╔══╦══╗",
      "║a ║b ║",
      "╠══╬══╣",
      "║c ║d ║",
      "╚══╩══╝",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| a");
    expect(result).toContain("| c");
  });

  test("列数が異なる行はパディングされる", () => {
    const input = [
      "┌──┬──┬──┐",
      "│a │b │c │",
      "├──┼──┼──┤",
      "│d │e │",
      "└──┴──┴──┘",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    const lines = result.split("\n");
    // All rows should have same number of pipes
    expect(lines[0].split("|").length).toBe(lines[2].split("|").length);
  });

  test("空行でテーブルが終了する場合", () => {
    const input = [
      "┌──┬──┐",
      "│a │b │",
      "├──┼──┤",
      "│c │d │",
      "└──┴──┘",
      "",
      "┌──┬──┐",
      "│x │y │",
      "└──┴──┘",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    expect(result).toContain("| a");
    expect(result).toContain("| x");
  });

  test("テーブル行中に非テーブル行が混入する場合", () => {
    const input = [
      "┌──┬──┐",
      "│a │b │",
      "├──┼──┤",
      "│c │d │",
      "└──┴──┘",
      "middle text",
      "┌──┬──┐",
      "│e │f │",
      "└──┴──┘",
    ].join("\n");
    const result = boxTableToMarkdown(input);
    expect(result).toContain("middle text");
    expect(result).toContain("| a");
    expect(result).toContain("| e");
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
