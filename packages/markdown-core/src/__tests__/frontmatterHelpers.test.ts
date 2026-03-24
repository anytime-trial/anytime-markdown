import {
  parseFrontmatter,
  prependFrontmatter,
  preprocessMarkdown,
  extractGifSettings,
} from "../utils/frontmatterHelpers";

// ---------- parseFrontmatter ----------
describe("parseFrontmatter", () => {
  test("フロントマター付き Markdown をパースできる", () => {
    const md = "---\ntitle: Hello\n---\n\n# Body";
    expect(parseFrontmatter(md)).toEqual({
      frontmatter: "title: Hello",
      body: "# Body",
    });
  });

  test("フロントマターなしの Markdown はそのまま返す", () => {
    const md = "# Heading\n\nText";
    expect(parseFrontmatter(md)).toEqual({ frontmatter: null, body: md });
  });

  test("空文字列", () => {
    expect(parseFrontmatter("")).toEqual({ frontmatter: null, body: "" });
  });

  test("フロントマターのみ（本文なし）", () => {
    const md = "---\ntitle: Only\n---";
    expect(parseFrontmatter(md)).toEqual({ frontmatter: "title: Only", body: "" });
  });

  test("閉じフェンスがない場合はフロントマターなし", () => {
    const md = "---\ntitle: Open\nno closing fence";
    expect(parseFrontmatter(md)).toEqual({ frontmatter: null, body: md });
  });

  test("空のフロントマター", () => {
    const md = "---\n\n---\n\nBody";
    expect(parseFrontmatter(md)).toEqual({ frontmatter: "", body: "Body" });
  });

  test("先頭が --- で始まらない場合", () => {
    const md = " ---\ntitle: indented\n---\nBody";
    expect(parseFrontmatter(md)).toEqual({ frontmatter: null, body: md });
  });

  test("フロントマター後の空行を最大2つスキップ", () => {
    // 1つの改行
    expect(parseFrontmatter("---\nk: v\n---\nBody").body).toBe("Body");
    // 2つの改行
    expect(parseFrontmatter("---\nk: v\n---\n\nBody").body).toBe("Body");
    // 3つの改行 → 3つ目は残る
    expect(parseFrontmatter("---\nk: v\n---\n\n\nBody").body).toBe("\nBody");
  });

  test("複数行の YAML コンテンツ", () => {
    const yaml = "title: Test\ntags:\n  - a\n  - b\ndate: 2026-01-01";
    const md = `---\n${yaml}\n---\n\n# Heading`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe(yaml);
    expect(result.body).toBe("# Heading");
  });

  test("本文中の --- はフロントマターとして扱わない", () => {
    const md = "# Title\n\n---\n\nText";
    expect(parseFrontmatter(md).frontmatter).toBeNull();
  });
});

// ---------- prependFrontmatter ----------
describe("prependFrontmatter", () => {
  test("フロントマターを先頭に付加", () => {
    expect(prependFrontmatter("# Body", "title: T")).toBe("---\ntitle: T\n---\n\n# Body");
  });

  test("null の場合は本文のみ返す", () => {
    expect(prependFrontmatter("# Body", null)).toBe("# Body");
  });

  test("空文字列のフロントマター", () => {
    expect(prependFrontmatter("Body", "")).toBe("---\n\n---\n\nBody");
  });

  test("空の本文", () => {
    expect(prependFrontmatter("", "k: v")).toBe("---\nk: v\n---\n\n");
  });

  test("両方空", () => {
    expect(prependFrontmatter("", null)).toBe("");
  });
});

// ---------- extractGifSettings ----------
describe("extractGifSettings", () => {
  test("GIF 設定コメントを抽出する", () => {
    const md = '![gif](test.gif)\n<!-- gif-settings: {"fps":10,"loop":true} -->\n\nText';
    const result = extractGifSettings(md);
    expect(result.gifSettings.size).toBe(1);
    expect(result.gifSettings.get("test.gif")).toBe('{"fps":10,"loop":true}');
    expect(result.body).not.toContain("gif-settings");
    expect(result.body).toContain("![gif](test.gif)");
    expect(result.body).toContain("Text");
  });

  test("GIF 設定がない場合は空の Map を返す", () => {
    const md = "# No gif\n\nJust text.";
    const result = extractGifSettings(md);
    expect(result.gifSettings.size).toBe(0);
    expect(result.body).toBe(md);
  });

  test("空文字列", () => {
    const result = extractGifSettings("");
    expect(result.gifSettings.size).toBe(0);
    expect(result.body).toBe("");
  });

  test("不正な JSON は無視してコメント行を残す", () => {
    const md = "![gif](a.gif)\n<!-- gif-settings: {invalid} -->\nText";
    const result = extractGifSettings(md);
    expect(result.gifSettings.size).toBe(0);
    expect(result.body).toContain("gif-settings");
  });

  test("直前行が画像でない場合は無視", () => {
    const md = 'Some text\n<!-- gif-settings: {"fps":10} -->\nMore text';
    const result = extractGifSettings(md);
    expect(result.gifSettings.size).toBe(0);
    expect(result.body).toContain("gif-settings");
  });

  test("複数の GIF 設定を抽出", () => {
    const md = [
      "![a](a.gif)",
      '<!-- gif-settings: {"fps":10} -->',
      "",
      "![b](b.gif)",
      '<!-- gif-settings: {"fps":30} -->',
    ].join("\n");
    const result = extractGifSettings(md);
    expect(result.gifSettings.size).toBe(2);
    expect(result.gifSettings.get("a.gif")).toBe('{"fps":10}');
    expect(result.gifSettings.get("b.gif")).toBe('{"fps":30}');
  });

  test("先頭行が画像+GIF設定の場合（i === 0 なので無視）", () => {
    const md = '<!-- gif-settings: {"fps":10} -->\nText';
    const result = extractGifSettings(md);
    expect(result.gifSettings.size).toBe(0);
  });
});

// ---------- preprocessMarkdown ----------
describe("preprocessMarkdown", () => {
  test("フロントマター付き Markdown を前処理", () => {
    const md = "---\ntitle: Hello\n---\n\n# Body\n\nText";
    const result = preprocessMarkdown(md);
    expect(result.frontmatter).toBe("title: Hello");
    expect(result.body).toContain("Body");
    expect(result.body).toContain("Text");
  });

  test("フロントマターなしの Markdown を前処理", () => {
    const md = "# Heading\n\nParagraph";
    const result = preprocessMarkdown(md);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toContain("Heading");
    expect(result.body).toContain("Paragraph");
  });

  test("空文字列の前処理", () => {
    const result = preprocessMarkdown("");
    expect(result.frontmatter).toBeNull();
    expect(result.comments.size).toBe(0);
    expect(result.imageAnnotations.size).toBe(0);
    expect(result.gifSettings.size).toBe(0);
  });

  test("フロントマターのみの前処理", () => {
    const md = "---\ntitle: Only FM\n---";
    const result = preprocessMarkdown(md);
    expect(result.frontmatter).toBe("title: Only FM");
    expect(result.body).toBe("");
  });

  test("戻り値の構造を持つ", () => {
    const result = preprocessMarkdown("# Test");
    expect(result).toHaveProperty("frontmatter");
    expect(result).toHaveProperty("comments");
    expect(result).toHaveProperty("body");
    expect(result).toHaveProperty("imageAnnotations");
    expect(result).toHaveProperty("gifSettings");
    expect(result.comments).toBeInstanceOf(Map);
    expect(result.imageAnnotations).toBeInstanceOf(Map);
    expect(result.gifSettings).toBeInstanceOf(Map);
  });

  test("GIF 設定付き Markdown を前処理", () => {
    const md = '![gif](test.gif)\n<!-- gif-settings: {"fps":10} -->\n\nText';
    const result = preprocessMarkdown(md);
    expect(result.gifSettings.size).toBe(1);
    expect(result.gifSettings.get("test.gif")).toBe('{"fps":10}');
    expect(result.body).not.toContain("gif-settings");
  });

  test("image-annotations 付き Markdown を前処理", () => {
    const md = "# Title\n\n<!-- image-comments\nimg1=annotation1\nimg2=annotation2\n-->";
    const result = preprocessMarkdown(md);
    expect(result.imageAnnotations.size).toBe(2);
    expect(result.imageAnnotations.get("img1")).toBe("annotation1");
    expect(result.imageAnnotations.get("img2")).toBe("annotation2");
  });
});
