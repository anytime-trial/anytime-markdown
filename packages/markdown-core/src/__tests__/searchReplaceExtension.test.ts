/**
 * searchReplaceExtension.ts の追加テスト
 * SearchReplaceExtension の設定、SearchReplaceStorage 型を検証
 */
import {
  SearchReplaceExtension,
  isRedosRisk,
  escapeRegExp,
  type SearchReplaceStorage,
} from "../searchReplaceExtension";

describe("SearchReplaceExtension", () => {
  it("has name 'searchReplace'", () => {
    expect(SearchReplaceExtension.name).toBe("searchReplace");
  });

  it("defines default storage", () => {
    expect(SearchReplaceExtension.config.addStorage).toBeDefined();
  });

  it("addStorage returns correct default values", () => {
    const addStorage = SearchReplaceExtension.config.addStorage as () => SearchReplaceStorage;
    const storage = addStorage();
    expect(storage.searchTerm).toBe("");
    expect(storage.replaceTerm).toBe("");
    expect(storage.results).toEqual([]);
    expect(storage.currentIndex).toBe(0);
    expect(storage.caseSensitive).toBe(false);
    expect(storage.wholeWord).toBe(false);
    expect(storage.useRegex).toBe(false);
    expect(storage.isOpen).toBe(false);
    expect(storage.showReplace).toBe(false);
    expect(storage.onSearchStateChange).toBeUndefined();
  });

  it("defines addCommands", () => {
    expect(SearchReplaceExtension.config.addCommands).toBeDefined();
  });

  it("defines addKeyboardShortcuts", () => {
    expect(SearchReplaceExtension.config.addKeyboardShortcuts).toBeDefined();
  });

  it("defines addProseMirrorPlugins", () => {
    expect(SearchReplaceExtension.config.addProseMirrorPlugins).toBeDefined();
  });
});

describe("SearchReplaceStorage type", () => {
  it("can construct a valid SearchReplaceStorage", () => {
    const storage: SearchReplaceStorage = {
      searchTerm: "hello",
      replaceTerm: "world",
      results: [{ from: 0, to: 5 }],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: true,
      showReplace: false,
    };
    expect(storage.searchTerm).toBe("hello");
    expect(storage.results).toHaveLength(1);
    expect(storage.isOpen).toBe(true);
  });
});

describe("isRedosRisk (additional cases)", () => {
  it("handles escaped parentheses", () => {
    // \\( should not be treated as group
    expect(isRedosRisk("\\(a+\\)+")).toBe(false);
  });

  it("handles empty string", () => {
    expect(isRedosRisk("")).toBe(false);
  });

  it("handles deeply nested risky patterns", () => {
    expect(isRedosRisk("((a+)+)+")).toBe(true);
  });

  it("returns false for simple alternation without quantifier on group", () => {
    expect(isRedosRisk("(a|b)")).toBe(false);
  });
});

describe("escapeRegExp (additional cases)", () => {
  it("escapes all special characters", () => {
    const special = ".*+?^${}()|[]\\";
    const escaped = escapeRegExp(special);
    // Each special char should be preceded by backslash
    expect(escaped).not.toEqual(special);
    // Should be safe to construct regex
    expect(() => new RegExp(escaped)).not.toThrow();
  });

  it("returns empty string for empty input", () => {
    expect(escapeRegExp("")).toBe("");
  });

  it("does not escape normal characters", () => {
    expect(escapeRegExp("hello")).toBe("hello");
  });

  it("escapes pipe character", () => {
    expect(escapeRegExp("a|b")).toBe("a\\|b");
  });
});
