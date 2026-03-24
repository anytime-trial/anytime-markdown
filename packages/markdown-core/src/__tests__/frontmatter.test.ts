import { parseFrontmatter, prependFrontmatter } from "../utils/frontmatterHelpers";

describe("parseFrontmatter", () => {
  test("フロントマターありのパース", () => {
    const md = "---\ntitle: Hello\ndate: 2026-01-01\n---\n\n# Body";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe("title: Hello\ndate: 2026-01-01");
    expect(result.body).toBe("# Body");
  });

  test("フロントマターなしのパース", () => {
    const md = "# Just a heading\n\nSome text.";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(md);
  });

  test("空のフロントマター", () => {
    const md = "---\n\n---\n\nBody text";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe("");
    expect(result.body).toBe("Body text");
  });

  test("フロントマター後に空行なし", () => {
    const md = "---\ntitle: Test\n---\n# Heading";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe("title: Test");
    expect(result.body).toBe("# Heading");
  });

  test("本文中の --- はフロントマターとして扱わない", () => {
    const md = "# Heading\n\n---\n\nSome text";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(md);
  });

  test("フロントマター内に複雑な YAML", () => {
    const yaml = "title: \"Hello: World\"\ntags:\n  - markdown\n  - editor\ndate: 2026-01-01";
    const md = `---\n${yaml}\n---\n\n# Body`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe(yaml);
    expect(result.body).toBe("# Body");
  });

  test("閉じ --- がない場合はフロントマターなし", () => {
    const md = "---\ntitle: Hello\n\n# Body";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(md);
  });

  test("フロントマターのみ（本文なし）", () => {
    const md = "---\ntitle: Hello\n---";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe("title: Hello");
    expect(result.body).toBe("");
  });

  test("フロントマター後に複数空行", () => {
    const md = "---\ntitle: Test\n---\n\n\n# Body";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBe("title: Test");
    expect(result.body).toBe("\n# Body");
  });
});

describe("prependFrontmatter", () => {
  test("フロントマターがある場合は先頭に付加", () => {
    const result = prependFrontmatter("# Body", "title: Hello");
    expect(result).toBe("---\ntitle: Hello\n---\n\n# Body");
  });

  test("フロントマターが null の場合はそのまま返す", () => {
    const result = prependFrontmatter("# Body", null);
    expect(result).toBe("# Body");
  });

  test("空文字列のフロントマター", () => {
    const result = prependFrontmatter("Body", "");
    expect(result).toBe("---\n\n---\n\nBody");
  });

  test("本文が空の場合", () => {
    const result = prependFrontmatter("", "title: Hello");
    expect(result).toBe("---\ntitle: Hello\n---\n\n");
  });
});

describe("ラウンドトリップ", () => {
  test("パース → 再付加で元に戻る", () => {
    const original = "---\ntitle: Hello\ndate: 2026-01-01\n---\n\n# Body\n\nText";
    const { frontmatter, body } = parseFrontmatter(original);
    const restored = prependFrontmatter(body, frontmatter);
    expect(restored).toBe(original);
  });

  test("フロントマターなしのラウンドトリップ", () => {
    const original = "# Body\n\nText";
    const { frontmatter, body } = parseFrontmatter(original);
    const restored = prependFrontmatter(body, frontmatter);
    expect(restored).toBe(original);
  });
});
