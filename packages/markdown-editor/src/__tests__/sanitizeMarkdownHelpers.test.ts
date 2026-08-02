import {
  isSameBlockContinuation,
  needsTightMark,
  shouldSkipHardBreak,
  findClosingTicks,
  protectInlineCodeSpans,
  protectSpans,
  restoreSpans,
  TIGHT_TRANSITION_MARKER,
} from "../utils/sanitizeMarkdown";

// ── isSameBlockContinuation ──

describe("isSameBlockContinuation", () => {
  test("blockquote ペアは継続と判定する", () => {
    expect(isSameBlockContinuation("> line1", "> line2")).toBe(true);
  });

  test("blockquote + 非 blockquote は非継続", () => {
    expect(isSameBlockContinuation("> line1", "plain")).toBe(false);
  });

  test("同種の箇条書きリスト（unordered）は継続", () => {
    expect(isSameBlockContinuation("- item1", "- item2")).toBe(true);
    expect(isSameBlockContinuation("* item1", "* item2")).toBe(true);
    expect(isSameBlockContinuation("+ item1", "+ item2")).toBe(true);
  });

  test("同種の番号付きリスト（ordered）は継続", () => {
    expect(isSameBlockContinuation("1. item1", "2. item2")).toBe(true);
    expect(isSameBlockContinuation("1) item1", "2) item2")).toBe(true);
  });

  test("異種リスト（ordered vs unordered）は非継続", () => {
    expect(isSameBlockContinuation("- item1", "1. item2")).toBe(false);
    expect(isSameBlockContinuation("1. item1", "- item2")).toBe(false);
  });

  test("インデント行は前ブロックの継続", () => {
    expect(isSameBlockContinuation("- item1", "  continued")).toBe(true);
    expect(isSameBlockContinuation("  line1", "  line2")).toBe(true);
  });

  test("ブロック開始 + インデントは継続", () => {
    expect(isSameBlockContinuation("# heading", "  text")).toBe(true);
  });

  test("バックスラッシュ改行は継続", () => {
    expect(isSameBlockContinuation("line1\\", "line2")).toBe(true);
  });

  test("プレーンテキスト同士は非継続", () => {
    expect(isSameBlockContinuation("plain1", "plain2")).toBe(false);
  });

  test("プレーン + 非インデント行は非継続", () => {
    expect(isSameBlockContinuation("plain", "# heading")).toBe(false);
  });
});

// ── needsTightMark ──

describe("needsTightMark", () => {
  test("見出し → 任意の行は tight mark が必要", () => {
    expect(needsTightMark("# heading", "plain text")).toBe(true);
    expect(needsTightMark("## heading", "- list")).toBe(true);
    expect(needsTightMark("### heading", "> quote")).toBe(true);
  });

  test("水平線 → 任意の行は tight mark が必要", () => {
    expect(needsTightMark("---", "plain")).toBe(true);
    expect(needsTightMark("***", "plain")).toBe(true);
  });

  test("任意の行 → ブロック開始は tight mark が必要", () => {
    expect(needsTightMark("plain", "# heading")).toBe(true);
    expect(needsTightMark("plain", "- list")).toBe(true);
    expect(needsTightMark("plain", "> quote")).toBe(true);
  });

  test("ブロック関連行 → プレーンテキストは tight mark が必要", () => {
    expect(needsTightMark("- item", "plain")).toBe(true);
    expect(needsTightMark("> quote", "plain")).toBe(true);
  });

  test("インデント行 → プレーンテキストは tight mark が必要", () => {
    expect(needsTightMark("  indented", "plain")).toBe(true);
  });

  test("プレーンテキスト同士は tight mark 不要", () => {
    expect(needsTightMark("plain1", "plain2")).toBe(false);
  });

  test("ブロック関連行 → インデント行は tight mark 不要", () => {
    expect(needsTightMark("- item", "  continued")).toBe(false);
  });
});

// ── shouldSkipHardBreak ──

describe("shouldSkipHardBreak", () => {
  test("空行がある場合はスキップ", () => {
    expect(shouldSkipHardBreak("", "text")).toBe(true);
    expect(shouldSkipHardBreak("text", "")).toBe(true);
    expect(shouldSkipHardBreak("", "")).toBe(true);
  });

  test("既にバックスラッシュ改行がある場合はスキップ", () => {
    expect(shouldSkipHardBreak("line\\", "next")).toBe(true);
  });

  test("既に末尾二重スペースがある場合はスキップ", () => {
    expect(shouldSkipHardBreak("line  ", "next")).toBe(true);
  });

  test("tight transition マーカー付きはスキップ", () => {
    expect(shouldSkipHardBreak("line" + TIGHT_TRANSITION_MARKER, "next")).toBe(true);
    expect(shouldSkipHardBreak("line " + TIGHT_TRANSITION_MARKER, "next")).toBe(true);
  });

  test("見出し行はスキップ", () => {
    expect(shouldSkipHardBreak("# heading", "next")).toBe(true);
    expect(shouldSkipHardBreak("## heading", "next")).toBe(true);
  });

  test("水平線はスキップ", () => {
    expect(shouldSkipHardBreak("---", "next")).toBe(true);
    expect(shouldSkipHardBreak("___", "next")).toBe(true);
  });

  test("リスト行はスキップ", () => {
    expect(shouldSkipHardBreak("- item", "next")).toBe(true);
    expect(shouldSkipHardBreak("text", "- item")).toBe(true);
    expect(shouldSkipHardBreak("1. item", "next")).toBe(true);
  });

  test("blockquote はスキップ", () => {
    expect(shouldSkipHardBreak("> quote", "next")).toBe(true);
    expect(shouldSkipHardBreak("text", "> quote")).toBe(true);
  });

  test("テーブル行はスキップ", () => {
    expect(shouldSkipHardBreak("| cell |", "next")).toBe(true);
    expect(shouldSkipHardBreak("text", "| cell |")).toBe(true);
  });

  test("HTML タグ行はスキップ", () => {
    expect(shouldSkipHardBreak("<br>", "next")).toBe(true);
    expect(shouldSkipHardBreak("text", "<div>")).toBe(true);
    expect(shouldSkipHardBreak("</div>", "next")).toBe(true);
    expect(shouldSkipHardBreak("text", "</div>")).toBe(true);
  });

  test("プレーンテキスト同士はスキップしない", () => {
    expect(shouldSkipHardBreak("hello", "world")).toBe(false);
  });
});

// ── findClosingTicks ──

describe("findClosingTicks", () => {
  test("単一バッククォートの閉じ位置を返す", () => {
    // "code`  (from=0 で ` を探す)
    expect(findClosingTicks("code`rest", "`", 1, 0)).toBe(4);
  });

  test("二重バッククォートの閉じ位置を返す", () => {
    expect(findClosingTicks("code``rest", "``", 2, 0)).toBe(4);
  });

  test("三重バッククォートの閉じ位置を返す", () => {
    expect(findClosingTicks("code```rest", "```", 3, 0)).toBe(4);
  });

  test("見つからない場合は -1 を返す", () => {
    expect(findClosingTicks("no closing", "`", 1, 0)).toBe(-1);
  });

  test("from 以降から検索する", () => {
    expect(findClosingTicks("`skip`find`", "`", 1, 2)).toBe(5);
  });

  test("前後にバッククォートが隣接する場合はスキップする", () => {
    // ``code`` の中の ` は隣接バッククォートがあるのでマッチしない
    expect(findClosingTicks("``code``", "`", 1, 0)).toBe(-1);
  });

  test("隣接バッククォートのない位置を見つける", () => {
    // "a`b" で from=0, 位置1に ` がある
    expect(findClosingTicks("a`b", "`", 1, 0)).toBe(1);
  });
});

// ── protectInlineCodeSpans ──

describe("protectInlineCodeSpans", () => {
  test("単一コードスパンを退避する", () => {
    const { result, codes } = protectInlineCodeSpans("before `code` after");
    expect(codes).toEqual(["`code`"]);
    expect(result).toBe("before \uE000IC0\uE000 after");
  });

  test("複数コードスパンを退避する", () => {
    const { result, codes } = protectInlineCodeSpans("`a` and `b`");
    expect(codes).toEqual(["`a`", "`b`"]);
    expect(result).toBe("\uE000IC0\uE000 and \uE000IC1\uE000");
  });

  test("二重バッククォートのコードスパンを退避する", () => {
    const { result, codes } = protectInlineCodeSpans("``code with ` inside``");
    expect(codes).toEqual(["``code with ` inside``"]);
    expect(result).toBe("\uE000IC0\uE000");
  });

  test("閉じバッククォートがない場合はそのまま出力する", () => {
    const { result, codes } = protectInlineCodeSpans("unclosed `code");
    expect(codes).toEqual([]);
    expect(result).toBe("unclosed `code");
  });

  test("コードスパンなしのテキストはそのまま", () => {
    const { result, codes } = protectInlineCodeSpans("plain text");
    expect(codes).toEqual([]);
    expect(result).toBe("plain text");
  });

  test("空文字列を処理する", () => {
    const { result, codes } = protectInlineCodeSpans("");
    expect(codes).toEqual([]);
    expect(result).toBe("");
  });
});

// ── protectSpans / restoreSpans roundtrip ──

describe("protectSpans / restoreSpans roundtrip", () => {
  const pattern = /<mark>[^<]*<\/mark>/g;
  const prefix = "MK";

  test("単一マッチをラウンドトリップする", () => {
    const original = "before <mark>hi</mark> after";
    const { result, spans } = protectSpans(original, pattern, prefix);
    expect(result).not.toContain("<mark>");
    expect(spans).toEqual(["<mark>hi</mark>"]);
    expect(restoreSpans(result, prefix, spans)).toBe(original);
  });

  test("複数マッチをラウンドトリップする", () => {
    const original = "<mark>a</mark> mid <mark>b</mark>";
    const { result, spans } = protectSpans(original, pattern, prefix);
    expect(spans).toHaveLength(2);
    expect(restoreSpans(result, prefix, spans)).toBe(original);
  });

  test("マッチなしはそのまま返す", () => {
    const original = "no marks here";
    const { result, spans } = protectSpans(original, pattern, prefix);
    expect(result).toBe(original);
    expect(spans).toEqual([]);
    expect(restoreSpans(result, prefix, spans)).toBe(original);
  });

  test("空文字列を処理する", () => {
    const { result, spans } = protectSpans("", pattern, prefix);
    expect(result).toBe("");
    expect(spans).toEqual([]);
    expect(restoreSpans(result, prefix, spans)).toBe("");
  });

  test("異なるプレフィックスが干渉しない", () => {
    const original = "<mark>x</mark>";
    const { result: r1, spans: s1 } = protectSpans(original, pattern, "AA");
    const { result: r2, spans: s2 } = protectSpans(original, pattern, "BB");
    // AA プレフィックスのプレースホルダに BB の復元を適用しても変わらない
    expect(restoreSpans(r1, "BB", s2)).toBe(r1);
    // 正しいプレフィックスで復元できる
    expect(restoreSpans(r1, "AA", s1)).toBe(original);
    expect(restoreSpans(r2, "BB", s2)).toBe(original);
  });
});
