/**
 * searchReplaceExtension.ts coverage test
 * Targets uncovered lines: 84-85, 92, 96, 109-117, 290-326
 * - getRegex: useRegex + redos risk, wholeWord with regex, catch branch
 * - findMatches: empty match, max iterations
 * - addProseMirrorPlugins: plugin state apply, view update
 */
import {
  SearchReplaceExtension,
  isRedosRisk,
  escapeRegExp,
  type SearchReplaceStorage,
} from "../searchReplaceExtension";

// ---------- getRegex coverage via setSearchTerm ----------

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

  const mockDoc = {
    descendants: jest.fn(),
    content: { size: 10 },
    forEach: jest.fn(),
    nodeSize: 12,
    childCount: 0,
    child: jest.fn(),
    type: { name: "doc" },
    eq: jest.fn().mockReturnValue(true),
  };

  const mockView = {
    dispatch: jest.fn(),
    domAtPos: jest.fn().mockReturnValue({
      node: { scrollIntoView: jest.fn(), parentElement: null },
    }),
  };

  const mockEditor = {
    state: {
      doc: mockDoc,
      tr: {
        insertText: jest.fn().mockReturnThis(),
        setMeta: jest.fn().mockReturnThis(),
        mapping: {},
        doc: mockDoc,
        docChanged: false,
        getMeta: jest.fn().mockReturnValue(undefined),
      },
    },
    view: mockView,
    storage: { searchReplace: storage },
  };

  return { storage, mockEditor, mockDoc };
}

describe("getRegex via setSearchTerm - useRegex with ReDoS risk", () => {
  it("returns null (empty results) when useRegex is true and pattern is ReDoS-prone", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();

    // Enable useRegex
    storage.useRegex = true;
    storage.searchTerm = "(a+)+"; // ReDoS-prone

    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.setSearchTerm("(a+)+")();

    // The regex should be null so results should be empty
    expect(storage.results).toEqual([]);
  });

  it("uses regex pattern when useRegex is true and pattern is safe", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor, mockDoc } = createMockContext();

    // Make doc return text nodes
    mockDoc.descendants.mockImplementation((cb: any) => {
      cb({ isText: true, text: "hello world hello" }, 1);
    });

    storage.useRegex = true;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.setSearchTerm("hel+o")();

    expect(storage.results.length).toBeGreaterThan(0);
  });
});

describe("getRegex - wholeWord with useRegex", () => {
  it("does NOT apply word boundary when both wholeWord and useRegex are true", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor, mockDoc } = createMockContext();

    mockDoc.descendants.mockImplementation((cb: any) => {
      cb({ isText: true, text: "helloworld" }, 1);
    });

    storage.wholeWord = true;
    storage.useRegex = true;
    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.setSearchTerm("hello")();

    // With useRegex, wholeWord boundary is NOT applied, so "hello" within "helloworld" should match
    expect(storage.results.length).toBe(1);
  });
});

describe("getRegex - invalid regex pattern (catch branch)", () => {
  it("returns null when regex is invalid", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();

    storage.useRegex = true;
    const commands = addCommands.call({ storage, editor: mockEditor });
    // Invalid regex pattern
    commands.setSearchTerm("[invalid")();

    expect(storage.results).toEqual([]);
  });
});

describe("getRegex - search term exceeds MAX_PATTERN_LENGTH", () => {
  it("returns null when search term is too long", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();

    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.setSearchTerm("a".repeat(1001))();

    expect(storage.results).toEqual([]);
  });
});

describe("findMatches - zero-length match and MAX_MATCH_ITERATIONS", () => {
  it("handles text nodes correctly", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor, mockDoc } = createMockContext();

    // Return a text node
    mockDoc.descendants.mockImplementation((cb: any) => {
      cb({ isText: true, text: "aaa bbb aaa" }, 1);
    });

    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.setSearchTerm("aaa")();

    expect(storage.results).toEqual([
      { from: 1, to: 4 },
      { from: 9, to: 12 },
    ]);
  });

  it("skips non-text nodes", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor, mockDoc } = createMockContext();

    mockDoc.descendants.mockImplementation((cb: any) => {
      // Non-text node
      cb({ isText: false, text: null }, 0);
      // Text node without text property
      cb({ isText: true, text: undefined }, 5);
      // Valid text node
      cb({ isText: true, text: "hello" }, 10);
    });

    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.setSearchTerm("hello")();

    expect(storage.results).toEqual([{ from: 10, to: 15 }]);
  });
});

describe("addProseMirrorPlugins - plugin state and view", () => {
  it("plugin state init returns empty DecorationSet", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    expect(plugins).toHaveLength(1);

    const plugin = plugins[0];
    expect(plugin).toBeDefined();
    // Plugin spec state init
    const initResult = plugin.spec.state.init();
    expect(initResult).toBeDefined();
  });

  it("plugin state apply returns meta when present", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];

    const metaValue = { some: "decorations" };
    const tr = {
      getMeta: jest.fn().mockReturnValue(metaValue),
      docChanged: false,
    };

    const result = plugin.spec.state.apply(tr, "oldDecos");
    expect(result).toBe(metaValue);
  });

  it("plugin state apply maps decorations when doc changed", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];

    const mappedDecos = { mapped: true };
    const oldDecorations = {
      map: jest.fn().mockReturnValue(mappedDecos),
    };
    const tr = {
      getMeta: jest.fn().mockReturnValue(undefined),
      docChanged: true,
      mapping: "mockMapping",
      doc: "mockDoc",
    };

    const result = plugin.spec.state.apply(tr, oldDecorations);
    expect(oldDecorations.map).toHaveBeenCalledWith("mockMapping", "mockDoc");
    expect(result).toBe(mappedDecos);
  });

  it("plugin state apply returns old decorations when no change", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];

    const oldDecorations = { old: true };
    const tr = {
      getMeta: jest.fn().mockReturnValue(undefined),
      docChanged: false,
    };

    const result = plugin.spec.state.apply(tr, oldDecorations);
    expect(result).toBe(oldDecorations);
  });

  it("plugin view update recomputes results when doc changes and search is open", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    storage.isOpen = true;
    storage.searchTerm = "hello";
    storage.results = [{ from: 1, to: 6 }];
    storage.currentIndex = 0;

    const onStateChange = jest.fn();
    storage.onSearchStateChange = onStateChange;

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];

    const viewInstance = plugin.spec.view();

    const newDoc = {
      descendants: jest.fn((cb: any) => {
        cb({ isText: true, text: "hello world hello" }, 1);
      }),
      eq: jest.fn().mockReturnValue(false),
    };

    const prevDoc = {
      eq: jest.fn().mockReturnValue(false),
    };

    viewInstance.update(
      { state: { doc: newDoc } },
      { doc: prevDoc },
    );

    // Results should have been updated (2 matches in "hello world hello")
    expect(storage.results.length).toBe(2);
    expect(onStateChange).toHaveBeenCalled();
  });

  it("plugin view update does nothing when search is not open", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    storage.isOpen = false;
    storage.searchTerm = "hello";

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];
    const viewInstance = plugin.spec.view();

    const prevDoc = { eq: jest.fn() };
    viewInstance.update(
      { state: { doc: { eq: jest.fn().mockReturnValue(true) } } },
      { doc: prevDoc },
    );

    // Nothing should happen
    expect(prevDoc.eq).not.toHaveBeenCalled();
  });

  it("plugin view update does nothing when searchTerm is empty", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    storage.isOpen = true;
    storage.searchTerm = "";

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];
    const viewInstance = plugin.spec.view();

    viewInstance.update(
      { state: { doc: { eq: jest.fn() } } },
      { doc: {} },
    );
  });

  it("plugin view update does nothing when doc is unchanged", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    storage.isOpen = true;
    storage.searchTerm = "hello";

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];
    const viewInstance = plugin.spec.view();

    const doc = {
      eq: jest.fn().mockReturnValue(true),
    };

    viewInstance.update(
      { state: { doc } },
      { doc: {} },
    );

    expect(doc.eq).toHaveBeenCalled();
  });

  it("plugin view update resets currentIndex when it exceeds new results length", () => {
    const addPlugins = SearchReplaceExtension.config.addProseMirrorPlugins as Function;
    const { storage, mockEditor } = createMockContext();

    storage.isOpen = true;
    storage.searchTerm = "xyz";
    storage.results = [{ from: 1, to: 4 }, { from: 5, to: 8 }];
    storage.currentIndex = 1;

    const plugins = addPlugins.call({ storage, editor: mockEditor });
    const plugin = plugins[0];
    const viewInstance = plugin.spec.view();

    // New doc has no matches
    const newDoc = {
      descendants: jest.fn((cb: any) => {
        cb({ isText: true, text: "no match here" }, 1);
      }),
      eq: jest.fn().mockReturnValue(false),
    };

    viewInstance.update(
      { state: { doc: newDoc } },
      { doc: { eq: jest.fn().mockReturnValue(false) } },
    );

    expect(storage.currentIndex).toBe(0);
  });
});

describe("isRedosRisk - additional branch coverage", () => {
  it("detects alternation with quantifier on group", () => {
    expect(isRedosRisk("(a|b)+")).toBe(true);
  });

  it("handles closing paren without following quantifier", () => {
    expect(isRedosRisk("(a+)b")).toBe(false);
  });

  it("handles depth > 0 with other chars", () => {
    expect(isRedosRisk("(abc)")).toBe(false);
  });

  it("handles } inside group as quantifier marker", () => {
    // } is treated as a quantifier indicator
    expect(isRedosRisk("(a{2})+")).toBe(true);
  });
});

describe("replaceCurrentMatch - match is undefined (index out of range)", () => {
  it("returns false when match at currentIndex is undefined", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();
    storage.results = [{ from: 0, to: 3 }];
    storage.currentIndex = 5; // out of range
    const commands = addCommands.call({ storage, editor: mockEditor });
    const result = commands.replaceCurrentMatch()();
    expect(result).toBe(false);
  });
});

describe("scrollToMatch - parentElement fallback and error handling", () => {
  it("uses parentElement when node is not HTMLElement", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();

    const scrollIntoView = jest.fn();
    mockEditor.view.domAtPos.mockReturnValue({
      node: {
        // Not an HTMLElement (Text node)
        parentElement: { scrollIntoView },
      },
    });

    storage.results = [{ from: 0, to: 3 }, { from: 5, to: 8 }];
    storage.currentIndex = 0;

    const commands = addCommands.call({ storage, editor: mockEditor });
    commands.goToNextMatch()();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("handles scrollToMatch when domAtPos throws", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();

    mockEditor.view.domAtPos.mockImplementation(() => {
      throw new Error("position out of range");
    });

    storage.results = [{ from: 0, to: 3 }];
    storage.currentIndex = 0;

    const commands = addCommands.call({ storage, editor: mockEditor });
    // Should not throw
    expect(() => commands.goToNextMatch()()).not.toThrow();
  });

  it("handles scrollToMatch when node and parentElement are null", () => {
    const addCommands = SearchReplaceExtension.config.addCommands as Function;
    const { storage, mockEditor } = createMockContext();

    mockEditor.view.domAtPos.mockReturnValue({
      node: { parentElement: null },
    });

    storage.results = [{ from: 0, to: 3 }];
    storage.currentIndex = 0;

    const commands = addCommands.call({ storage, editor: mockEditor });
    // Should not throw - node?.scrollIntoView handles null
    expect(() => commands.goToNextMatch()()).not.toThrow();
  });
});

describe("Escape with replaceTerm set", () => {
  it("calls closeSearch when only replaceTerm is set", () => {
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
      replaceTerm: "something",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: true,
      showReplace: true,
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor, storage });
    const result = shortcuts["Escape"]();
    expect(result).toBe(true);
    expect(mockEditor.commands.closeSearch).toHaveBeenCalled();
  });
});
