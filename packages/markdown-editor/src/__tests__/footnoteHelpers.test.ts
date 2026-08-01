// preprocessFootnoteRefs の実体は markdown-engine（sanitizeMarkdown が本番使用）。
// 旧 utils/footnoteHelpers.ts シムは dead code のため削除し、直接 import する。
import { preprocessFootnoteRefs } from "@anytime-markdown/markdown-engine";

/* ------------------------------------------------------------------ */
/*  preprocessFootnoteRefs                                            */
/* ------------------------------------------------------------------ */
describe("preprocessFootnoteRefs", () => {
  test("脚注参照 [^id] を <sup> に変換する", () => {
    const input = "See [^1] for details.";
    const expected = 'See <sup data-footnote-ref="1">1</sup> for details.';
    expect(preprocessFootnoteRefs(input)).toBe(expected);
  });

  test("複数の脚注参照を変換する", () => {
    const input = "First [^a] and second [^b].";
    const expected =
      'First <sup data-footnote-ref="a">a</sup> and second <sup data-footnote-ref="b">b</sup>.';
    expect(preprocessFootnoteRefs(input)).toBe(expected);
  });

  test("脚注定義行 [^id]: はエスケープして保持する", () => {
    const input = "[^1]: This is a footnote definition.";
    expect(preprocessFootnoteRefs(input)).toBe("\\[^1]: This is a footnote definition.");
  });

  test("脚注参照と定義が混在する場合", () => {
    const input = "Text [^note].\n\n[^note]: Definition here.";
    const result = preprocessFootnoteRefs(input);
    expect(result).toContain('<sup data-footnote-ref="note">note</sup>');
    expect(result).toContain("\\[^note]: Definition here.");
  });

  test("コードブロック内の [^id] はスキップする", () => {
    const input = "```\n[^1]\n```";
    expect(preprocessFootnoteRefs(input)).toBe(input);
  });

  test("コードスパン内の [^id] はスキップする", () => {
    const input = "Use `[^1]` in code.";
    expect(preprocessFootnoteRefs(input)).toBe(input);
  });

  test("二重バッククォートのコードスパン内もスキップする", () => {
    const input = "Use ``[^1]`` in code.";
    expect(preprocessFootnoteRefs(input)).toBe(input);
  });

  test("コードスパンの外側の脚注は変換する", () => {
    const input = "Text `code` and [^1].";
    const expected = 'Text `code` and <sup data-footnote-ref="1">1</sup>.';
    expect(preprocessFootnoteRefs(input)).toBe(expected);
  });

  test("脚注IDにハイフンを含む場合", () => {
    const input = "See [^my-note].";
    const expected = 'See <sup data-footnote-ref="my-note">my-note</sup>.';
    expect(preprocessFootnoteRefs(input)).toBe(expected);
  });

  test("空文字列を処理できる", () => {
    expect(preprocessFootnoteRefs("")).toBe("");
  });

  test("脚注参照がない場合はそのまま返す", () => {
    const input = "No footnotes here.";
    expect(preprocessFootnoteRefs(input)).toBe(input);
  });

  test("コードスパンは行をまたいで閉じない（次行の [^1] は変換する）", () => {
    const input = "open `code\nand [^1].";
    const expected = 'open `code\nand <sup data-footnote-ref="1">1</sup>.';
    expect(preprocessFootnoteRefs(input)).toBe(expected);
  });

  test("開始と異なる長さのバッククォート列では閉じない", () => {
    const input = "``[^1]` tail";
    expect(preprocessFootnoteRefs(input)).toBe(
      '``<sup data-footnote-ref="1">1</sup>` tail',
    );
  });

  test("閉じないバッククォート列と長文の組み合わせでも線形時間で処理する", () => {
    // 旧実装の /(`+)(.*?)\1/ は開始バッククォート数 × 入力長に比例して膨らんだ
    const input = `x${"`".repeat(4001)}${"a".repeat(400_000)}`;
    const startedAt = performance.now();
    expect(preprocessFootnoteRefs(input)).toBe(input);
    expect(performance.now() - startedAt).toBeLessThan(300);
  });
});
