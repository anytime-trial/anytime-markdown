/**
 * diffEngine.ts coverage2 tests
 * Targets: line 162, line 292, lines 305-491 (computeSemanticDiff)
 */
import {
  computeDiff,
  computeSemanticDiff,
} from "../utils/diffEngine";

describe("diffEngine coverage2 - computeDiff padding", () => {
  it("produces padding lines on left when right has more modified lines", () => {
    const left = "same\nold\nsame";
    const right = "same\nnew1\nnew2\nnew3\nsame";
    const result = computeDiff(left, right);
    expect(result.blocks.length).toBeGreaterThan(0);
    const paddingLines = result.leftLines.filter((l) => l.type === "padding");
    expect(paddingLines.length).toBeGreaterThan(0);
    for (const pl of paddingLines) {
      expect(pl.lineNumber).toBeNull();
      expect(pl.text).toBe("");
    }
  });

  it("produces padding lines on right when left has more modified lines", () => {
    const left = "same\nold1\nold2\nold3\nsame";
    const right = "same\nnew\nsame";
    const result = computeDiff(left, right);
    const paddingLines = result.rightLines.filter((l) => l.type === "padding");
    expect(paddingLines.length).toBeGreaterThan(0);
  });
});

describe("diffEngine coverage2 - computeSemanticDiff", () => {
  it("returns empty result for two empty strings", () => {
    const result = computeSemanticDiff("", "");
    expect(result.leftLines).toHaveLength(0);
    expect(result.rightLines).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
  });

  it("falls back to computeDiff when neither side has headings", () => {
    const result = computeSemanticDiff("line1\nline2", "line1\nmodified");
    expect(result.leftLines.length).toBeGreaterThan(0);
    expect(result.rightLines.length).toBeGreaterThan(0);
  });

  it("performs semantic diff with matching headings", () => {
    const left = "# Title\n\nSome body text\n\n## Section A\n\nContent A";
    const right = "# Title\n\nModified body\n\n## Section A\n\nContent A updated";
    const result = computeSemanticDiff(left, right);
    expect(result.leftLines.length).toBeGreaterThan(0);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it("detects heading changes", () => {
    const left = "# Title A\n\nBody\n\n## Sub\n\nContent";
    const right = "# Title B\n\nBody\n\n## Sub\n\nContent";
    const result = computeSemanticDiff(left, right);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it("handles sections only on one side", () => {
    const left = "# Title\n\nBody\n\n## Only Left\n\nLeft content";
    const right = "# Title\n\nBody\n\n## Only Right\n\nRight content";
    const result = computeSemanticDiff(left, right);
    expect(result.leftLines.length).toBeGreaterThan(0);
  });

  it("handles nested children sections", () => {
    const left = "# Main\n\nbody\n\n## Child A\n\ncontent\n\n## Child B\n\ncontent B";
    const right = "# Main\n\nbody mod\n\n## Child A\n\ncontent upd\n\n## Child B\n\ncontent B";
    const result = computeSemanticDiff(left, right);
    expect(result.leftLines.length).toBeGreaterThan(0);
  });

  it("handles leaf sections", () => {
    const result = computeSemanticDiff("# Title\n\nContent A", "# Title\n\nContent B");
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it("renumbers blocks correctly with multiple sections", () => {
    const left = "# S1\n\nold1\n\n# S2\n\nold2\n\n# S3\n\nold3";
    const right = "# S1\n\nnew1\n\n# S2\n\nnew2\n\n# S3\n\nnew3";
    const result = computeSemanticDiff(left, right);
    const ids = result.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles empty body between headings", () => {
    const left = "# Title\n\n## A\n\nContent";
    const right = "# Title\n\n## B\n\nContent";
    const result = computeSemanticDiff(left, right);
    expect(result.leftLines.length).toBeGreaterThan(0);
  });

  it("works when only left has headings", () => {
    const result = computeSemanticDiff("# Title\n\nContent", "No headings");
    expect(result.leftLines.length).toBeGreaterThan(0);
  });

  it("works when only right has headings", () => {
    const result = computeSemanticDiff("No headings", "# Title\n\nContent");
    expect(result.rightLines.length).toBeGreaterThan(0);
  });

  it("passes options through", () => {
    const left = "# Title\n\n  hello  ";
    const right = "# Title\n\nhello";
    const r1 = computeSemanticDiff(left, right);
    const r2 = computeSemanticDiff(left, right, { ignoreWhitespace: true });
    expect(r2.blocks.length).toBeLessThanOrEqual(r1.blocks.length);
  });
});
