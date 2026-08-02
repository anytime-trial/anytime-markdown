import {
  type MergedChange,
  normalizeForComparison,
  mergeAdjacentChanges,
  neutralizeBlankLineDiffs,
} from "../utils/diffEngine";

describe("normalizeForComparison", () => {
  it("returns original texts when no options are set", () => {
    const result = normalizeForComparison("Hello\nWorld", "Foo\nBar", {});
    expect(result).toEqual({ compareLeft: "Hello\nWorld", compareRight: "Foo\nBar" });
  });

  it("trims trailing whitespace when ignoreWhitespace is true", () => {
    const result = normalizeForComparison("Hello  \nWorld\t", "Foo \nBar  ", { ignoreWhitespace: true });
    expect(result).toEqual({ compareLeft: "Hello\nWorld", compareRight: "Foo\nBar" });
  });

  it("lowercases when ignoreCase is true", () => {
    const result = normalizeForComparison("Hello\nWORLD", "FOO\nBar", { ignoreCase: true });
    expect(result).toEqual({ compareLeft: "hello\nworld", compareRight: "foo\nbar" });
  });

  it("applies both ignoreWhitespace and ignoreCase together", () => {
    const result = normalizeForComparison("Hello  \n", "FOO \n", {
      ignoreWhitespace: true,
      ignoreCase: true,
    });
    expect(result).toEqual({ compareLeft: "hello\n", compareRight: "foo\n" });
  });

  it("handles empty input strings", () => {
    const result = normalizeForComparison("", "", { ignoreWhitespace: true, ignoreCase: true });
    expect(result).toEqual({ compareLeft: "", compareRight: "" });
  });
});

describe("mergeAdjacentChanges", () => {
  it("merges adjacent removed+added into modified", () => {
    const changes = [
      { value: "old\n", count: 1, removed: true, added: false },
      { value: "new\n", count: 1, removed: false, added: true },
    ];
    const result = mergeAdjacentChanges(changes, ["old"], ["new"]);
    expect(result).toEqual([
      { type: "modified", leftLines: ["old"], rightLines: ["new"] },
    ]);
  });

  it("preserves equal changes", () => {
    const changes = [
      { value: "same\n", count: 1, removed: false, added: false },
    ];
    const result = mergeAdjacentChanges(changes, ["same"], ["same"]);
    expect(result).toEqual([
      { type: "equal", leftLines: ["same"], rightLines: ["same"] },
    ]);
  });

  it("handles standalone added change", () => {
    const changes = [
      { value: "new\n", count: 1, removed: false, added: true },
    ];
    const result = mergeAdjacentChanges(changes, [], ["new"]);
    expect(result).toEqual([
      { type: "added", leftLines: [], rightLines: ["new"] },
    ]);
  });

  it("handles standalone removed change", () => {
    const changes = [
      { value: "old\n", count: 1, removed: true, added: false },
    ];
    const result = mergeAdjacentChanges(changes, ["old"], []);
    expect(result).toEqual([
      { type: "removed", leftLines: ["old"], rightLines: [] },
    ]);
  });

  it("handles mixed sequence: equal, removed+added, equal", () => {
    const changes = [
      { value: "line1\n", count: 1, removed: false, added: false },
      { value: "old\n", count: 1, removed: true, added: false },
      { value: "new\n", count: 1, removed: false, added: true },
      { value: "line3\n", count: 1, removed: false, added: false },
    ];
    const left = ["line1", "old", "line3"];
    const right = ["line1", "new", "line3"];
    const result = mergeAdjacentChanges(changes, left, right);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("equal");
    expect(result[1].type).toBe("modified");
    expect(result[2].type).toBe("equal");
  });
});

describe("neutralizeBlankLineDiffs", () => {
  it("converts blank-line-only changes to equal", () => {
    const merged: MergedChange[] = [
      { type: "added", leftLines: [], rightLines: ["", "  "] },
    ];
    neutralizeBlankLineDiffs(merged);
    expect(merged[0].type).toBe("equal");
    expect(merged[0].leftLines).toEqual(["", ""]);
    expect(merged[0].rightLines).toEqual(["", "  "]);
  });

  it("preserves non-blank changes", () => {
    const merged: MergedChange[] = [
      { type: "added", leftLines: [], rightLines: ["hello"] },
    ];
    neutralizeBlankLineDiffs(merged);
    expect(merged[0].type).toBe("added");
  });

  it("does not modify equal entries", () => {
    const merged: MergedChange[] = [
      { type: "equal", leftLines: ["foo"], rightLines: ["foo"] },
    ];
    neutralizeBlankLineDiffs(merged);
    expect(merged[0].type).toBe("equal");
    expect(merged[0].leftLines).toEqual(["foo"]);
  });

  it("pads shorter side to match longer side length", () => {
    const merged: MergedChange[] = [
      { type: "removed", leftLines: ["", "", ""], rightLines: [] },
    ];
    neutralizeBlankLineDiffs(merged);
    expect(merged[0].type).toBe("equal");
    expect(merged[0].leftLines).toHaveLength(3);
    expect(merged[0].rightLines).toHaveLength(3);
  });

  it("handles modified with blank lines on both sides", () => {
    const merged: MergedChange[] = [
      { type: "modified", leftLines: [""], rightLines: ["", ""] },
    ];
    neutralizeBlankLineDiffs(merged);
    expect(merged[0].type).toBe("equal");
    expect(merged[0].leftLines).toHaveLength(2);
    expect(merged[0].rightLines).toHaveLength(2);
  });
});
