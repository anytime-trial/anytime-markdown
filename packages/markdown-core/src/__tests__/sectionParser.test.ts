import { matchSections, parseMarkdownSections, type MarkdownSection } from "../utils/sectionParser";

describe("parseMarkdownSections", () => {
  test("見出しなしテキストはルートセクション1つ", () => {
    const result = parseMarkdownSections("line1\nline2");
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBeNull();
    expect(result[0].bodyLines).toEqual(["line1", "line2"]);
    expect(result[0].children).toEqual([]);
  });

  test("H2 で分割される", () => {
    const text = "intro\n## A\nbody a\n## B\nbody b";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(3);
    expect(result[0].heading).toBeNull();
    expect(result[0].bodyLines).toEqual(["intro"]);
    expect(result[1].heading).toBe("A");
    expect(result[1].level).toBe(2);
    expect(result[1].headingLine).toBe("## A");
    expect(result[1].bodyLines).toEqual(["body a"]);
    expect(result[2].heading).toBe("B");
    expect(result[2].bodyLines).toEqual(["body b"]);
  });

  test("サブ見出しが children に格納される", () => {
    const text = "## Parent\nbody\n### Child1\nchild body\n### Child2\nchild2 body";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("Parent");
    expect(result[0].bodyLines).toEqual(["body"]);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].heading).toBe("Child1");
    expect(result[0].children[0].bodyLines).toEqual(["child body"]);
    expect(result[0].children[1].heading).toBe("Child2");
    expect(result[0].children[1].bodyLines).toEqual(["child2 body"]);
  });

  test("空テキストは空配列", () => {
    expect(parseMarkdownSections("")).toEqual([]);
  });

  test("コードブロック内の # は見出しとして扱わない", () => {
    const text = "## Real\n```\n## Not a heading\n```\nafter";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("Real");
    expect(result[0].bodyLines).toContain("```");
    expect(result[0].bodyLines).toContain("## Not a heading");
    expect(result[0].bodyLines).toContain("after");
  });

  test("H1 の下に H2, H3 がネストする", () => {
    const text = "# Top\ntop body\n## Mid\nmid body\n### Deep\ndeep body";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("Top");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].heading).toBe("Mid");
    expect(result[0].children[0].children).toHaveLength(1);
    expect(result[0].children[0].children[0].heading).toBe("Deep");
  });

  test("見出しのみ（本文なし）のセクション", () => {
    const text = "## A\n## B";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(2);
    expect(result[0].bodyLines).toEqual([]);
    expect(result[1].bodyLines).toEqual([]);
  });
});

describe("matchSections", () => {
  const sec = (heading: string): MarkdownSection => ({
    heading, level: 2, headingLine: `## ${heading}`,
    bodyLines: [], children: [],
  });

  test("同一見出しがマッチする", () => {
    const left = [sec("A"), sec("B")];
    const right = [sec("A"), sec("B")];
    const result = matchSections(left, right);
    expect(result).toEqual([
      { type: "matched", left: left[0], right: right[0] },
      { type: "matched", left: left[1], right: right[1] },
    ]);
  });

  test("左にのみ存在するセクション", () => {
    const left = [sec("A"), sec("B")];
    const right = [sec("A")];
    const result = matchSections(left, right);
    expect(result[0].type).toBe("matched");
    expect(result[1]).toEqual({ type: "left-only", left: left[1], right: null });
  });

  test("右にのみ存在するセクション", () => {
    const left = [sec("A")];
    const right = [sec("A"), sec("C")];
    const result = matchSections(left, right);
    expect(result[0].type).toBe("matched");
    expect(result[1]).toEqual({ type: "right-only", left: null, right: right[1] });
  });

  test("順序が変わった場合は LCS でマッチ", () => {
    const left = [sec("A"), sec("B"), sec("C")];
    const right = [sec("B"), sec("A"), sec("C")];
    const result = matchSections(left, right);
    const matched = result.filter(r => r.type === "matched");
    expect(matched.length).toBe(2); // LCS: B,C or A,C (length 2)
  });

  test("空配列同士は空結果", () => {
    expect(matchSections([], [])).toEqual([]);
  });

  test("片側が空の場合はすべて left-only / right-only", () => {
    const left = [sec("A"), sec("B")];
    const result = matchSections(left, []);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.type === "left-only")).toBe(true);
  });

  test("片側が空の場合はすべて right-only", () => {
    const right = [sec("X"), sec("Y")];
    const result = matchSections([], right);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.type === "right-only")).toBe(true);
  });
});

describe("parseMarkdownSections - code blocks", () => {
  test("コードブロック内の見出しは無視される", () => {
    const text = "## Real\nbody\n```\n## Fake\n```\n## Next\nnext body";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe("Real");
    expect(result[1].heading).toBe("Next");
  });

  test("空テキストは空配列を返す", () => {
    expect(parseMarkdownSections("")).toEqual([]);
  });

  test("コードブロック内の見出しがrootBodyにある場合", () => {
    const text = "intro\n```\n## Fake\n```\n## Real\nbody";
    const result = parseMarkdownSections(text);
    const rootSection = result.find(s => s.heading === null);
    expect(rootSection).toBeDefined();
    expect(rootSection!.bodyLines.join("\n")).toContain("## Fake");
  });

  test("見出し後のサブセクションがコードブロック内", () => {
    const text = "## Parent\nbody\n```\n### Fake child\n```\n### Real child\nchild body";
    const result = parseMarkdownSections(text);
    expect(result[0].heading).toBe("Parent");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].heading).toBe("Real child");
  });

  test("コードブロック内のfindSectionEnd skip", () => {
    const text = "## A\nbody\n```\n## B inside code\n```\n## C\nc body";
    const result = parseMarkdownSections(text);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe("A");
    expect(result[1].heading).toBe("C");
  });
});
