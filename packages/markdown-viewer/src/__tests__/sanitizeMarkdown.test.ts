import {
  sanitizeMarkdown,
  preserveBlankLines,
  restoreBlankLines,
  splitByCodeBlocks,
  normalizeCodeSpanDelimitersInLine,
  BLANK_LINE_MARKER,
  TIGHT_TRANSITION_MARKER,
} from "../utils/sanitizeMarkdown";

describe("sanitizeMarkdown", () => {
  // ── XSS 防止 ──

  test("script タグを除去する", () => {
    const result = sanitizeMarkdown("<script>alert('xss')</script>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("onerror 属性付き img タグを除去する", () => {
    expect(sanitizeMarkdown('<img src=x onerror="alert(1)">')).toBe("");
  });

  test("iframe タグを除去する", () => {
    expect(sanitizeMarkdown('<iframe src="https://evil.com"></iframe>')).toBe("");
  });

  test("style タグを除去する", () => {
    const result = sanitizeMarkdown("<style>body{display:none}</style>");
    expect(result).not.toContain("<style>");
  });

  test("javascript: プロトコルを含む a タグを除去する", () => {
    const result = sanitizeMarkdown('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  test("SVG 内の script を除去する", () => {
    const svg = '<svg><script>alert(1)</script></svg>';
    expect(sanitizeMarkdown(svg)).not.toContain("<script>");
  });

  test("onload イベントハンドラを除去する", () => {
    const result = sanitizeMarkdown('<div onload="alert(1)">text</div>');
    expect(result).not.toContain("onload");
  });

  // ── 許可タグの保持 ──

  test("mark タグを保持する", () => {
    expect(sanitizeMarkdown("<mark>highlighted</mark>")).toBe("<mark>highlighted</mark>");
  });

  test("kbd タグを保持する", () => {
    expect(sanitizeMarkdown("<kbd>Ctrl</kbd>")).toBe("<kbd>Ctrl</kbd>");
  });

  test("sub/sup タグを保持する", () => {
    expect(sanitizeMarkdown("H<sub>2</sub>O")).toBe("H<sub>2</sub>O");
    expect(sanitizeMarkdown("x<sup>2</sup>")).toBe("x<sup>2</sup>");
  });

  test("br タグを保持する", () => {
    expect(sanitizeMarkdown("line1<br>line2")).toBe("line1<br>line2");
  });

  test("hr タグを保持する", () => {
    expect(sanitizeMarkdown("<hr>")).toBe("<hr>");
  });

  // ── Markdown 構文の保持 ──

  test("Markdown の < > & を保持する", () => {
    const md = "a < b && c > d";
    expect(sanitizeMarkdown(md)).toBe("a < b && c > d");
  });

  test("見出しをそのまま保持する", () => {
    expect(sanitizeMarkdown("# Hello")).toBe("# Hello");
  });

  test("太字・強調をそのまま保持する", () => {
    expect(sanitizeMarkdown("**bold** and *italic*")).toBe("**bold** and *italic*");
  });

  test("リンクをそのまま保持する", () => {
    expect(sanitizeMarkdown("[text](https://example.com)")).toBe("[text](https://example.com)");
  });

  // ── コードブロック・コードスパンの保護 ──

  test("コードブロック内の HTML はサニタイズしない", () => {
    const md = "```html\n<script>alert(1)</script>\n```";
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test("インラインコード内の HTML はサニタイズしない", () => {
    const md = "use `<script>` tag";
    expect(sanitizeMarkdown(md)).toBe("use `<script>` tag");
  });

  test("二重バッククォートのインラインコードを保護する", () => {
    const md = "use `` `code` `` syntax";
    expect(sanitizeMarkdown(md)).toBe("use `` `code` `` syntax");
  });

  // ── 前処理統合 ──

  test("数式ブロック ($$.$$) を math コードブロックに変換する", () => {
    const md = "$$\nx^2\n$$";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("```math");
  });

  // ── エッジケース ──

  test("空文字列を処理できる", () => {
    expect(sanitizeMarkdown("")).toBe("");
  });

  test("空白のみの入力を処理できる", () => {
    expect(sanitizeMarkdown("   ")).toBe("   ");
  });

  test("改行のみの入力を処理できる", () => {
    expect(sanitizeMarkdown("\n\n\n")).toBe("\n\n\n");
  });

  test("巨大な入力でも処理が完了する（ReDoS 耐性）", () => {
    const large = "a".repeat(100000);
    const start = Date.now();
    sanitizeMarkdown(large);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test("テーブル行内コードスパンのパイプをエスケープする", () => {
    const md = "| `a|b` | c |\n| --- | --- |\n| d | e |";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("`a\\|b`");
  });
});

describe("splitByCodeBlocks", () => {
  test("コードブロックなしの場合、1要素の配列を返す", () => {
    const parts = splitByCodeBlocks("hello world");
    expect(parts).toEqual(["hello world"]);
  });

  test("コードブロックを分離する", () => {
    const md = "before\n```js\ncode\n```\nafter";
    const parts = splitByCodeBlocks(md);
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("before\n");
    expect(parts[1]).toBe("```js\ncode\n```");
    expect(parts[2]).toBe("\nafter");
  });

  test("結合すると元の文字列に戻る", () => {
    const md = "text\n```\ncode1\n```\nmiddle\n```python\ncode2\n```\nend";
    const parts = splitByCodeBlocks(md);
    expect(parts.join("")).toBe(md);
  });

  test("閉じフェンスがないコードブロックをスキップする", () => {
    const md = "before\n```\nunclosed code";
    const parts = splitByCodeBlocks(md);
    expect(parts.join("")).toBe(md);
  });

  test("空文字列を処理できる", () => {
    expect(splitByCodeBlocks("")).toEqual([]);
  });

  test("ネストしたバッククォートを正しく処理する", () => {
    const md = "```\n````\n```\nafter";
    const parts = splitByCodeBlocks(md);
    expect(parts.join("")).toBe(md);
  });
});

describe("preserveBlankLines", () => {
  test("3つ以上の連続改行を ZWSP マーカーで保持する", () => {
    const md = "para1\n\n\npara2";
    const result = preserveBlankLines(md);
    expect(result).toContain(BLANK_LINE_MARKER);
  });

  test("2つの改行（通常の段落区切り）はマーカーを付けない", () => {
    const md = "para1\n\npara2";
    const result = preserveBlankLines(md);
    expect(result).not.toContain(BLANK_LINE_MARKER);
  });

  test("コードブロック内の空行はそのまま保持する", () => {
    const md = "```\nline1\n\n\n\nline2\n```";
    const result = preserveBlankLines(md);
    expect(result).toBe(md);
  });

  test("見出し→テキストの tight transition にマーカーを付ける", () => {
    const md = "# Heading\ntext";
    const result = preserveBlankLines(md);
    expect(result).toContain(TIGHT_TRANSITION_MARKER);
  });

  test("同一リスト内の連続項目にはマーカーを付けない", () => {
    const md = "- item1\n- item2\n- item3";
    const result = preserveBlankLines(md);
    expect(result).not.toContain(TIGHT_TRANSITION_MARKER);
  });
});

describe("restoreBlankLines", () => {
  test("ZWSP マーカーを除去して空行を復元する", () => {
    const md = `para1\n\n${BLANK_LINE_MARKER}\n\npara2`;
    const result = restoreBlankLines(md);
    // ZWSP + \n が除去され、\n\n + \n + para2 = \n\n\npara2
    expect(result).toBe("para1\n\n\npara2");
    expect(result).not.toContain(BLANK_LINE_MARKER);
  });

  test("ZWNJ マーカーを除去して tight transition を復元する", () => {
    const md = `# Heading${TIGHT_TRANSITION_MARKER}\n\ntext`;
    const result = restoreBlankLines(md);
    expect(result).toBe("# Heading\ntext");
  });

  test("強調末尾の tight transition を復元する", () => {
    const md = `**bold** ${TIGHT_TRANSITION_MARKER}\n\ntext`;
    const result = restoreBlankLines(md);
    expect(result).toBe("**bold**\ntext");
  });

  test("コードフェンス後の tight transition を復元する", () => {
    const md = `code\n\n${TIGHT_TRANSITION_MARKER}text`;
    const result = restoreBlankLines(md);
    expect(result).toBe("code\ntext");
  });

  test("マーカーがない文字列はそのまま返す", () => {
    const md = "plain text\n\nparagraph";
    expect(restoreBlankLines(md)).toBe(md);
  });
});

describe("normalizeCodeSpanDelimitersInLine", () => {
  test("不要に多いバッククォートを最小化する", () => {
    // 内容に ` がないので 1 個で十分
    expect(normalizeCodeSpanDelimitersInLine("``code``")).toBe("`code`");
  });

  test("内容に ` がある場合は 2 個を維持する", () => {
    expect(normalizeCodeSpanDelimitersInLine("`` a`b ``")).toBe("`` a`b ``");
  });

  test("内容に `` がある場合は 1 個で囲める", () => {
    expect(normalizeCodeSpanDelimitersInLine("``` a``b ```")).toBe("` a``b `");
  });

  test("バッククォートがない行はそのまま返す", () => {
    expect(normalizeCodeSpanDelimitersInLine("no code here")).toBe("no code here");
  });

  test("閉じられていないバッククォートはそのまま返す", () => {
    expect(normalizeCodeSpanDelimitersInLine("`unclosed")).toBe("`unclosed");
  });

  test("空文字列を処理できる", () => {
    expect(normalizeCodeSpanDelimitersInLine("")).toBe("");
  });

  test("複数のコードスパンを含む行を処理できる", () => {
    const result = normalizeCodeSpanDelimitersInLine("``a`` and ``b``");
    expect(result).toBe("`a` and `b`");
  });
});
