import { computeSemanticDiff } from "../utils/diffEngine";

describe("computeSemanticDiff", () => {
  test("同一テキストは全行 equal", () => {
    const text = "## A\nline1\n## B\nline2";
    const result = computeSemanticDiff(text, text);
    expect(result.blocks).toHaveLength(0);
    expect(result.leftLines.every(l => l.type === "equal")).toBe(true);
  });

  test("セクション内の変更が正しく検出される", () => {
    const left = "## A\nold line\n## B\nsame";
    const right = "## A\nnew line\n## B\nsame";
    const result = computeSemanticDiff(left, right);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks[0].type).toBe("modified");
  });

  test("左にのみ存在するセクションがパディングされる", () => {
    const left = "## A\nbody a\n## B\nbody b";
    const right = "## A\nbody a";
    const result = computeSemanticDiff(left, right);
    const paddingLines = result.rightLines.filter(l => l.type === "padding");
    expect(paddingLines.length).toBeGreaterThan(0);
    // 左側の ## B セクション（見出し + 本文 = 2行）分のパディング
    expect(paddingLines.length).toBe(2);
  });

  test("右にのみ存在するセクションがパディングされる", () => {
    const left = "## A\nbody a";
    const right = "## A\nbody a\n## C\nbody c";
    const result = computeSemanticDiff(left, right);
    const paddingLines = result.leftLines.filter(l => l.type === "padding");
    expect(paddingLines.length).toBe(2);
  });

  test("サブ見出しが再帰的にマッチングされる", () => {
    const left = "## A\n### Sub1\nold\n### Sub2\nsame";
    const right = "## A\n### Sub1\nnew\n### Sub2\nsame";
    const result = computeSemanticDiff(left, right);
    expect(result.blocks.length).toBe(1);
    expect(result.blocks[0].type).toBe("modified");
  });

  test("見出しなしテキストは computeDiff にフォールバック", () => {
    const left = "line1\nline2";
    const right = "line1\nline3";
    const result = computeSemanticDiff(left, right);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  test("leftLines と rightLines の長さが一致する", () => {
    const left = "## A\na1\na2\n## B\nb1";
    const right = "## A\na1\n## C\nc1\n## B\nb1";
    const result = computeSemanticDiff(left, right);
    expect(result.leftLines.length).toBe(result.rightLines.length);
  });

  test("両方空テキストの場合は空結果", () => {
    const result = computeSemanticDiff("", "");
    expect(result.leftLines).toHaveLength(0);
    expect(result.rightLines).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
  });
});
