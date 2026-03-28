import { computeDiff, computeInlineDiff, applyMerge, type DiffBlock } from "../utils/diffEngine";

// ---------- computeDiff ----------

describe("computeDiff", () => {
  test("同一テキスト → blocks 空、全行 equal", () => {
    const text = "line1\nline2\nline3";
    const result = computeDiff(text, text);
    expect(result.blocks).toHaveLength(0);
    expect(result.leftLines.every((l) => l.type === "equal")).toBe(true);
    expect(result.rightLines.every((l) => l.type === "equal")).toBe(true);
    expect(result.leftLines).toHaveLength(3);
  });

  test("右側に行追加 → added ブロック", () => {
    const left = "line1\nline2\n";
    const right = "line1\nline2\nline3\n";
    const result = computeDiff(left, right);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe("added");
    expect(result.blocks[0].rightLines).toEqual(["line3"]);
    expect(result.blocks[0].leftLines).toEqual([]);
  });

  test("左側から行削除 → removed ブロック", () => {
    const left = "line1\nline2\nline3";
    const right = "line1\nline3";
    const result = computeDiff(left, right);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe("removed");
    expect(result.blocks[0].leftLines).toEqual(["line2"]);
    expect(result.blocks[0].rightLines).toEqual([]);
  });

  test("行変更 → modified ブロック", () => {
    const left = "line1\nold\nline3";
    const right = "line1\nnew\nline3";
    const result = computeDiff(left, right);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe("modified");
    expect(result.blocks[0].leftLines).toEqual(["old"]);
    expect(result.blocks[0].rightLines).toEqual(["new"]);

    const modOld = result.leftLines.filter((l) => l.type === "modified-old");
    const modNew = result.rightLines.filter((l) => l.type === "modified-new");
    expect(modOld).toHaveLength(1);
    expect(modNew).toHaveLength(1);
  });

  test("複数の差分ブロック → 正しい blockId 連番", () => {
    const left = "a\nb\nc\nd";
    const right = "a\nB\nc\nD";
    const result = computeDiff(left, right);
    expect(result.blocks.length).toBeGreaterThanOrEqual(2);
    const ids = result.blocks.map((b) => b.id);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1] + 1);
    }
  });

  test("行数が異なる modified → padding 行生成", () => {
    const left = "line1\nold1\nold2\nline4";
    const right = "line1\nnew1\nline4";
    const result = computeDiff(left, right);
    const block = result.blocks.find((b) => b.type === "modified");
    expect(block).toBeDefined();

    const paddings = result.rightLines.filter(
      (l) => l.type === "padding" && l.blockId === block!.id,
    );
    expect(paddings.length).toBeGreaterThan(0);
    expect(paddings[0].lineNumber).toBeNull();
  });

  test("空テキスト同士 → blocks 空", () => {
    const result = computeDiff("", "");
    expect(result.blocks).toHaveLength(0);
    expect(result.leftLines).toHaveLength(0);
    expect(result.rightLines).toHaveLength(0);
  });

  test("ignoreWhitespace → 末尾空白の差異を無視", () => {
    const left = "hello  \nworld";
    const right = "hello\nworld";
    const result = computeDiff(left, right, { ignoreWhitespace: true });
    expect(result.blocks).toHaveLength(0);
  });

  test("ignoreCase → 大文字小文字の差異を無視", () => {
    const left = "Hello\nWorld";
    const right = "hello\nworld";
    const result = computeDiff(left, right, { ignoreCase: true });
    expect(result.blocks).toHaveLength(0);
  });

  test("ignoreBlankLines → 空行のみの差異を equal 化", () => {
    const left = "line1\n\nline3";
    const right = "line1\nline3";
    const result = computeDiff(left, right, { ignoreBlankLines: true });
    // ignoreBlankLines converts blank-only diffs to equal
    const allEqual = result.leftLines.every((l) => l.type === "equal" || l.type === "padding");
    expect(allEqual || result.blocks.length === 0).toBe(true);
  });
});

// ---------- computeInlineDiff ----------

describe("computeInlineDiff", () => {
  test("同一テキスト → 全セグメント equal", () => {
    const { oldSegments, newSegments } = computeInlineDiff("hello world", "hello world");
    expect(oldSegments.every((s) => s.type === "equal")).toBe(true);
    expect(newSegments.every((s) => s.type === "equal")).toBe(true);
  });

  test("単語追加 → added セグメント", () => {
    const { oldSegments, newSegments } = computeInlineDiff("hello", "hello world");
    const added = newSegments.filter((s) => s.type === "added");
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((s) => s.text.includes("world"))).toBe(true);
    // old 側に added はない
    expect(oldSegments.every((s) => s.type !== "added")).toBe(true);
  });

  test("単語削除 → removed セグメント", () => {
    const { oldSegments, newSegments } = computeInlineDiff("hello world", "hello");
    const removed = oldSegments.filter((s) => s.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.some((s) => s.text.includes("world"))).toBe(true);
    // new 側に removed はない
    expect(newSegments.every((s) => s.type !== "removed")).toBe(true);
  });

  test("単語変更 → removed + added セグメント", () => {
    const { oldSegments, newSegments } = computeInlineDiff("hello world", "hello earth");
    const removed = oldSegments.filter((s) => s.type === "removed");
    const added = newSegments.filter((s) => s.type === "added");
    expect(removed.length).toBeGreaterThan(0);
    expect(added.length).toBeGreaterThan(0);
  });
});

// ---------- applyMerge ----------

describe("applyMerge", () => {
  const left = "line1\nold\nline3";
  const right = "line1\nnew\nline3";

  function getModifiedBlock(): DiffBlock {
    const result = computeDiff(left, right);
    return result.blocks[0];
  }

  test("left-to-right: 左の行で右を置換", () => {
    const block = getModifiedBlock();
    const { newRightText } = applyMerge(left, right, block, "left-to-right");
    expect(newRightText).toBe("line1\nold\nline3");
  });

  test("right-to-left: 右の行で左を置換", () => {
    const block = getModifiedBlock();
    const { newLeftText } = applyMerge(left, right, block, "right-to-left");
    expect(newLeftText).toBe("line1\nnew\nline3");
  });

  test("added ブロックのマージ (left-to-right)", () => {
    const l = "line1\nline2\n";
    const r = "line1\nline2\nline3\n";
    const result = computeDiff(l, r);
    const block = result.blocks[0];
    expect(block.type).toBe("added");
    const { newRightText } = applyMerge(l, r, block, "left-to-right");
    expect(newRightText).toBe("line1\nline2\n");
  });

  test("removed ブロックのマージ (right-to-left)", () => {
    const l = "line1\nline2\nline3";
    const r = "line1\nline3";
    const result = computeDiff(l, r);
    const block = result.blocks[0];
    expect(block.type).toBe("removed");
    const { newLeftText } = applyMerge(l, r, block, "right-to-left");
    // right has no lines for this block, so the removed lines are deleted from left
    expect(newLeftText).toBe("line1\nline3");
  });
});
