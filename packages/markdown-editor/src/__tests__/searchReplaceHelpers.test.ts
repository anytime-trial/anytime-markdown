/**
 * isRedosRisk / escapeRegExp のユニットテスト
 */
import { isRedosRisk, escapeRegExp } from "../searchReplaceExtension";

describe("isRedosRisk", () => {
  it.each([
    ["(a+)+", "nested quantifier plus-plus"],
    ["(a*)+", "nested quantifier star-plus"],
    ["(a+)*", "nested quantifier plus-star"],
    ["(a{2,})+", "nested quantifier brace-plus"],
  ])("returns true for %s (%s)", (pattern) => {
    expect(isRedosRisk(pattern)).toBe(true);
  });

  it("returns true for quantified groups with alternation: (a|b)+", () => {
    expect(isRedosRisk("(a|b)+")).toBe(true);
  });

  it("returns true for optional groups with quantifier: (a?)+", () => {
    expect(isRedosRisk("(a?)+")).toBe(true);
  });

  it.each([
    ["abc", "plain string"],
    ["a+b", "single quantifier, no group"],
    ["[a-z]+", "character class with quantifier"],
    ["(abc)+", "group with quantifier but no inner quantifier/alternation/optional"],
  ])("returns false for safe pattern %s (%s)", (pattern) => {
    expect(isRedosRisk(pattern)).toBe(false);
  });

  it("returns false for escaped characters: \\(a+\\)+", () => {
    // The backslashes escape the parens, so the scanner should not see groups
    expect(isRedosRisk("\\(a+\\)+")).toBe(false);
  });
});

describe("escapeRegExp", () => {
  it("escapes all regex special characters", () => {
    const special = ".*+?^${}()|[]\\";
    const escaped = escapeRegExp(special);
    // Each special char should be preceded by a backslash
    expect(escaped).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
    // The escaped string used in a RegExp should match the original literally
    const re = new RegExp(escaped);
    expect(re.test(special)).toBe(true);
  });

  it("passes normal text through unchanged", () => {
    expect(escapeRegExp("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeRegExp("")).toBe("");
  });
});
