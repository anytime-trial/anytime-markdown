/**
 * searchReplaceExtension.ts の追加カバレッジテスト
 * SearchReplaceExtension.create() の addCommands / addKeyboardShortcuts / addProseMirrorPlugins
 * の実行パスをテスト。既存 searchReplaceExtension.test.ts と重複しないこと。
 */
import {
  SearchReplaceExtension,
  isRedosRisk,
  escapeRegExp,
  type SearchReplaceStorage,
} from "../searchReplaceExtension";

describe("SearchReplaceExtension addCommands", () => {
  function createMockContext() {
    const storage: SearchReplaceStorage = {
      searchTerm: "",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: false,
      showReplace: false,
      onSearchStateChange: undefined,
    };

    const mockView = {
      dispatch: jest.fn(),
      domAtPos: jest.fn().mockReturnValue({
        node: { scrollIntoView: jest.fn(), parentElement: null },
      }),
    };

    const mockDoc = {
      descendants: jest.fn((cb: any) => {}),
      content: { size: 10 },
      forEach: jest.fn(),
      nodeSize: 10,
      childCount: 0,
      child: jest.fn(),
      type: { name: "doc" },
    };

    const mockEditor = {
      state: {
        doc: mockDoc,
        tr: {
          insertText: jest.fn().mockReturnThis(),
          setMeta: jest.fn().mockReturnThis(),
        },
      },
      view: mockView,
      storage: { searchReplace: storage },
    };

    return { storage, mockEditor };
  }

  it("setSearchTerm sets searchTerm and resets currentIndex", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    const handler = commands.setSearchTerm("hello");
    const result = handler();
    expect(storage.searchTerm).toBe("hello");
    expect(storage.currentIndex).toBe(0);
    expect(result).toBe(true);
  });

  it("setReplaceTerm sets replaceTerm", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    const handler = commands.setReplaceTerm("world");
    const result = handler();
    expect(storage.replaceTerm).toBe("world");
    expect(result).toBe(true);
  });

  it("toggleCaseSensitive toggles caseSensitive", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    expect(storage.caseSensitive).toBe(false);
    commands.toggleCaseSensitive()();
    expect(storage.caseSensitive).toBe(true);
    commands.toggleCaseSensitive()();
    expect(storage.caseSensitive).toBe(false);
  });

  it("toggleWholeWord toggles wholeWord", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.toggleWholeWord()();
    expect(storage.wholeWord).toBe(true);
  });

  it("toggleUseRegex toggles useRegex", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.toggleUseRegex()();
    expect(storage.useRegex).toBe(true);
  });

  it("goToNextMatch returns false when no results", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.goToNextMatch()();
    expect(result).toBe(false);
  });

  it("goToNextMatch cycles through results", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    storage.results = [
      { from: 0, to: 3 },
      { from: 5, to: 8 },
    ];
    storage.currentIndex = 0;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.goToNextMatch()();
    expect(storage.currentIndex).toBe(1);
    commands.goToNextMatch()();
    expect(storage.currentIndex).toBe(0); // wraps around
  });

  it("goToPrevMatch returns false when no results", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.goToPrevMatch()();
    expect(result).toBe(false);
  });

  it("goToPrevMatch cycles backwards", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    storage.results = [
      { from: 0, to: 3 },
      { from: 5, to: 8 },
    ];
    storage.currentIndex = 0;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.goToPrevMatch()();
    expect(storage.currentIndex).toBe(1); // wraps to end
  });

  it("replaceCurrentMatch returns false when no results", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.replaceCurrentMatch()();
    expect(result).toBe(false);
  });

  it("replaceCurrentMatch dispatches replacement", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    storage.results = [{ from: 0, to: 5 }];
    storage.replaceTerm = "bye";
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.replaceCurrentMatch()();
    expect(result).toBe(true);
    expect(mockEditor.view.dispatch).toHaveBeenCalled();
  });

  it("replaceAllMatches returns false when no results", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.replaceAllMatches()();
    expect(result).toBe(false);
  });

  it("replaceAllMatches dispatches replacement for all matches", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    storage.results = [
      { from: 0, to: 3 },
      { from: 5, to: 8 },
    ];
    storage.replaceTerm = "x";
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.replaceAllMatches()();
    expect(result).toBe(true);
    expect(storage.results).toEqual([]);
    expect(storage.currentIndex).toBe(0);
  });

  it("openSearch sets isOpen and showReplace", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const onChange = jest.fn();
    storage.onSearchStateChange = onChange;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.openSearch()();
    expect(storage.isOpen).toBe(true);
    expect(storage.showReplace).toBe(false);
    expect(onChange).toHaveBeenCalled();
  });

  it("openSearchReplace sets isOpen and showReplace true", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    const onChange = jest.fn();
    storage.onSearchStateChange = onChange;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.openSearchReplace()();
    expect(storage.isOpen).toBe(true);
    expect(storage.showReplace).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it("closeSearch resets all state", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    storage.isOpen = true;
    storage.searchTerm = "test";
    storage.replaceTerm = "replaced";
    storage.results = [{ from: 0, to: 4 }];
    storage.currentIndex = 1;
    const onChange = jest.fn();
    storage.onSearchStateChange = onChange;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.closeSearch()();
    expect(storage.isOpen).toBe(false);
    expect(storage.searchTerm).toBe("");
    expect(storage.replaceTerm).toBe("");
    expect(storage.results).toEqual([]);
    expect(storage.currentIndex).toBe(0);
    expect(onChange).toHaveBeenCalled();
  });
});

describe("SearchReplaceExtension addKeyboardShortcuts", () => {
  it("defines Mod-f, Mod-h, Escape shortcuts", () => {
    const addShortcuts = SearchReplaceExtension.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      commands: {
        openSearch: jest.fn(),
        openSearchReplace: jest.fn(),
        closeSearch: jest.fn(),
      },
    };
    const storage: SearchReplaceStorage = {
      searchTerm: "",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: false,
      showReplace: false,
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor, storage });
    expect(shortcuts["Mod-f"]).toBeDefined();
    expect(shortcuts["Mod-h"]).toBeDefined();
    expect(shortcuts["Escape"]).toBeDefined();
  });

  it("Mod-f calls openSearch", () => {
    const addShortcuts = SearchReplaceExtension.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      commands: {
        openSearch: jest.fn(),
        openSearchReplace: jest.fn(),
        closeSearch: jest.fn(),
      },
    };
    const storage: SearchReplaceStorage = {
      searchTerm: "",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: false,
      showReplace: false,
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor, storage });
    const result = shortcuts["Mod-f"]();
    expect(mockEditor.commands.openSearch).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("Mod-h calls openSearchReplace", () => {
    const addShortcuts = SearchReplaceExtension.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      commands: {
        openSearch: jest.fn(),
        openSearchReplace: jest.fn(),
        closeSearch: jest.fn(),
      },
    };
    const storage: SearchReplaceStorage = {
      searchTerm: "",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: false,
      showReplace: false,
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor, storage });
    const result = shortcuts["Mod-h"]();
    expect(mockEditor.commands.openSearchReplace).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("Escape returns false when no searchTerm or replaceTerm", () => {
    const addShortcuts = SearchReplaceExtension.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      commands: {
        openSearch: jest.fn(),
        openSearchReplace: jest.fn(),
        closeSearch: jest.fn(),
      },
    };
    const storage: SearchReplaceStorage = {
      searchTerm: "",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: false,
      showReplace: false,
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor, storage });
    const result = shortcuts["Escape"]();
    expect(result).toBe(false);
    expect(mockEditor.commands.closeSearch).not.toHaveBeenCalled();
  });

  it("Escape calls closeSearch when searchTerm is set", () => {
    const addShortcuts = SearchReplaceExtension.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      commands: {
        openSearch: jest.fn(),
        openSearchReplace: jest.fn(),
        closeSearch: jest.fn(),
      },
    };
    const storage: SearchReplaceStorage = {
      searchTerm: "test",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: true,
      showReplace: false,
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor, storage });
    const result = shortcuts["Escape"]();
    expect(result).toBe(true);
    expect(mockEditor.commands.closeSearch).toHaveBeenCalled();
  });
});

describe("isRedosRisk additional patterns", () => {
  it("detects group with quantifier inside followed by quantifier", () => {
    expect(isRedosRisk("(a+){2,}")).toBe(true);
  });

  it("detects optional quantifier group", () => {
    expect(isRedosRisk("(a?)+")).toBe(true);
  });

  it("safe simple pattern", () => {
    expect(isRedosRisk("abc")).toBe(false);
  });

  it("safe character class", () => {
    expect(isRedosRisk("[abc]+")).toBe(false);
  });
});
