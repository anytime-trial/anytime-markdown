/**
 * diffEngine.ts coverage3 tests
 * Targets remaining uncovered branches:
 * - normalizeForComparison with ignoreWhitespace/ignoreCase (lines 81,83)
 * - equal line rightLines fallback (line 130)
 * - computeSemanticDiff heading comparison (line 350, 374)
 * - processOneSideSection left/right (lines 410, 425)
 * - processMatch type guards (lines 448, 460, 461)
 * - appendSubDiff edge cases (lines 471, 500, 501)
 * - applyMerge with empty text (lines 500, 501)
 */
import {
  computeDiff,
  computeSemanticDiff,
  normalizeForComparison,
  mergeAdjacentChanges,
  applyMerge,
  neutralizeBlankLineDiffs,
} from "../utils/diffEngine";

describe("diffEngine coverage3", () => {
  describe("normalizeForComparison", () => {
    it("applies ignoreWhitespace only", () => {
      const { compareLeft, compareRight } = normalizeForComparison(
        "hello  \nworld  ", "hello\nworld", { ignoreWhitespace: true }
      );
      expect(compareLeft).toBe("hello\nworld");
      expect(compareRight).toBe("hello\nworld");
    });

    it("applies ignoreCase only", () => {
      const { compareLeft, compareRight } = normalizeForComparison(
        "Hello\nWorld", "hello\nworld", { ignoreCase: true }
      );
      expect(compareLeft).toBe("hello\nworld");
      expect(compareRight).toBe("hello\nworld");
    });

    it("applies both ignoreWhitespace and ignoreCase", () => {
      const { compareLeft, compareRight } = normalizeForComparison(
        "Hello  \nWorld  ", "hello\nworld", { ignoreWhitespace: true, ignoreCase: true }
      );
      expect(compareLeft).toBe("hello\nworld");
      expect(compareRight).toBe("hello\nworld");
    });
  });

  describe("computeDiff with options", () => {
    it("ignoreBlankLines converts blank-only diffs to equal", () => {
      const left = "line1\n\nline2";
      const right = "line1\n\n\nline2";
      const result = computeDiff(left, right, { ignoreBlankLines: true });
      // All blocks should be empty if blank lines are neutralized
      const nonEqualLines = result.leftLines.filter(l => l.type !== "equal" && l.type !== "padding");
      // The diff should be minimal
      expect(result.blocks.length).toBe(0);
    });

    it("handles ignoreWhitespace option", () => {
      const left = "  hello  ";
      const right = "hello";
      const result = computeDiff(left, right, { ignoreWhitespace: true });
      expect(result).toBeDefined();
    });
  });

  describe("computeSemanticDiff", () => {
    it("returns empty result for both empty strings", () => {
      const result = computeSemanticDiff("", "");
      expect(result.leftLines).toEqual([]);
      expect(result.rightLines).toEqual([]);
      expect(result.blocks).toEqual([]);
    });

    it("falls back to computeDiff when no headings on either side", () => {
      const left = "paragraph 1\nparagraph 2";
      const right = "paragraph 1\nparagraph 3";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("handles matched sections with different headings", () => {
      const left = "# Title A\ncontent\n## Sub A\nsub content";
      const right = "# Title B\ncontent\n## Sub B\nsub content changed";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("handles left-only section", () => {
      const left = "# Section 1\ncontent 1\n# Section 2\ncontent 2";
      const right = "# Section 1\ncontent 1";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
      const removedBlocks = result.blocks.filter(b => b.type === "removed");
      expect(removedBlocks.length).toBeGreaterThan(0);
    });

    it("handles right-only section", () => {
      const left = "# Section 1\ncontent 1";
      const right = "# Section 1\ncontent 1\n# Section 2\ncontent 2";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
      const addedBlocks = result.blocks.filter(b => b.type === "added");
      expect(addedBlocks.length).toBeGreaterThan(0);
    });

    it("handles sections with children and body", () => {
      const left = "# Title\nbody line\n## Sub 1\nsub content 1\n## Sub 2\nsub content 2";
      const right = "# Title\nbody line changed\n## Sub 1\nsub content 1\n## Sub 3\nsub content 3";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("handles section with heading only, no body or children", () => {
      const left = "# Title\ncontent";
      const right = "# Title\ncontent changed";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
    });

    it("handles sections where heading matches but body differs", () => {
      const left = "# Same Heading\nold body\n## Child\nchild body";
      const right = "# Same Heading\nnew body\n## Child\nchild body";
      const result = computeSemanticDiff(left, right);
      expect(result.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("applyMerge", () => {
    it("left-to-right replaces right side lines", () => {
      const left = "line1\nchanged\nline3";
      const right = "line1\noriginal\nline3";
      const block = {
        id: 0, type: "modified" as const,
        leftStartLine: 1, leftEndLine: 2,
        rightStartLine: 1, rightEndLine: 2,
        leftLines: ["changed"], rightLines: ["original"],
      };
      const result = applyMerge(left, right, block, "left-to-right");
      expect(result.newRightText).toContain("changed");
    });

    it("right-to-left replaces left side lines", () => {
      const left = "line1\noriginal\nline3";
      const right = "line1\nchanged\nline3";
      const block = {
        id: 0, type: "modified" as const,
        leftStartLine: 1, leftEndLine: 2,
        rightStartLine: 1, rightEndLine: 2,
        leftLines: ["original"], rightLines: ["changed"],
      };
      const result = applyMerge(left, right, block, "right-to-left");
      expect(result.newLeftText).toContain("changed");
    });

    it("handles empty left text", () => {
      const block = {
        id: 0, type: "added" as const,
        leftStartLine: 0, leftEndLine: 0,
        rightStartLine: 0, rightEndLine: 1,
        leftLines: [], rightLines: ["new line"],
      };
      const result = applyMerge("", "new line", block, "right-to-left");
      expect(result.newLeftText).toBe("new line");
    });

    it("handles empty right text", () => {
      const block = {
        id: 0, type: "removed" as const,
        leftStartLine: 0, leftEndLine: 1,
        rightStartLine: 0, rightEndLine: 0,
        leftLines: ["old line"], rightLines: [],
      };
      const result = applyMerge("old line", "", block, "left-to-right");
      expect(result.newRightText).toBe("old line");
    });
  });

  describe("neutralizeBlankLineDiffs edge cases", () => {
    it("pads left when left has fewer blank lines", () => {
      const merged = [{ type: "modified" as const, leftLines: [""], rightLines: ["", ""] }];
      neutralizeBlankLineDiffs(merged);
      expect(merged[0].type).toBe("equal");
      expect(merged[0].leftLines.length).toBe(2);
    });

    it("pads right when right has fewer blank lines", () => {
      const merged = [{ type: "modified" as const, leftLines: ["", ""], rightLines: [""] }];
      neutralizeBlankLineDiffs(merged);
      expect(merged[0].type).toBe("equal");
      expect(merged[0].rightLines.length).toBe(2);
    });
  });
});
