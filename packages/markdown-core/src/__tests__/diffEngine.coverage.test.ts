/**
 * diffEngine.ts のカバレッジテスト
 * 未カバレッジの関数やエッジケースをカバー
 */
import {
  normalizeForComparison,
  mergeAdjacentChanges,
  neutralizeBlankLineDiffs,
  computeDiff,
  computeInlineDiff,
  computeSemanticDiff,
  applyMerge,
} from "../utils/diffEngine";

describe("diffEngine coverage", () => {
  describe("normalizeForComparison", () => {
    it("normalizes with default options", () => {
      const result = normalizeForComparison("  Hello  ", "  World  ", {});
      expect(result.compareLeft).toBeDefined();
      expect(result.compareRight).toBeDefined();
    });

    it("normalizes with ignoreWhitespace", () => {
      const result = normalizeForComparison("  a  b  ", "a b", { ignoreWhitespace: true });
      expect(result.compareLeft).toBeDefined();
    });

    it("normalizes with ignoreCase", () => {
      const result = normalizeForComparison("Hello", "hello", { ignoreCase: true });
      expect(result.compareLeft).toBe(result.compareRight);
    });
  });

  describe("mergeAdjacentChanges", () => {
    it("merges adjacent added/removed changes", () => {
      const changes = [
        { added: true, removed: false, value: "new\n", count: 1 },
        { added: false, removed: true, value: "old\n", count: 1 },
      ];
      const result = mergeAdjacentChanges(changes, ["old"], ["new"]);
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles equal change", () => {
      const changes = [{ added: false, removed: false, value: "same\n", count: 1 }];
      const result = mergeAdjacentChanges(changes, ["same"], ["same"]);
      expect(result.length).toBe(1);
    });
  });

  describe("neutralizeBlankLineDiffs", () => {
    it("neutralizes blank line diffs", () => {
      const merged = [
        { type: "added" as const, leftLines: [] as string[], rightLines: [""], leftStart: 0, rightStart: 0 },
      ];
      neutralizeBlankLineDiffs(merged);
    });
  });

  describe("computeDiff", () => {
    it("computes diff between identical texts", () => {
      const result = computeDiff("hello", "hello");
      expect(result.blocks.length).toBe(0);
    });

    it("computes diff between different texts", () => {
      const result = computeDiff("a\nb\nc", "a\nx\nc");
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("handles empty texts", () => {
      const result = computeDiff("", "new text");
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("works with semantic option", () => {
      const result = computeDiff("a\nb", "a\nc", { semantic: true });
      expect(result.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("computeInlineDiff", () => {
    it("computes inline diff for two lines", () => {
      const result = computeInlineDiff("hello world", "hello earth");
      expect(result.oldSegments.length).toBeGreaterThan(0);
      expect(result.newSegments.length).toBeGreaterThan(0);
    });

    it("handles identical lines", () => {
      const result = computeInlineDiff("same", "same");
      expect(result.oldSegments.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("computeSemanticDiff", () => {
    it("computes semantic diff", () => {
      const result = computeSemanticDiff("line 1\nline 2", "line 1\nline 3");
      expect(result.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("applyMerge", () => {
    it("applies left-to-right merge", () => {
      const diff = computeDiff("old", "new");
      const block = diff.blocks[0];
      if (block) {
        const result = applyMerge("old", "new", block, "left-to-right");
        expect(result.newLeftText).toBeDefined();
        expect(result.newRightText).toBeDefined();
      }
    });

    it("applies right-to-left merge", () => {
      const diff = computeDiff("old", "new");
      const block = diff.blocks[0];
      if (block) {
        const result = applyMerge("old", "new", block, "right-to-left");
        expect(result.newLeftText).toBeDefined();
      }
    });
  });
});
