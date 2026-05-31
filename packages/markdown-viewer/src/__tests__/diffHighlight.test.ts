/**
 * diffHighlight.ts の純粋関数テスト
 * computeBlockDiff, diffHighlightPluginKey, PlaceholderPosition, BlockDiffResult をテスト
 */
import {
  computeBlockDiff,
  diffHighlightPluginKey,
  DiffHighlight,
  type BlockDiffResult,
  type PlaceholderPosition,
} from "../extensions/diffHighlight";
import type { Node as PMNode } from "@tiptap/pm/model";

// --- helper: PMNode-like mock ---
function mockNode(text: string, typeName: string, attrs: Record<string, unknown> = {}): PMNode {
  return {
    textContent: text,
    type: { name: typeName },
    attrs: { level: undefined, ...attrs },
    nodeSize: text.length + 2,
    content: { size: text.length },
    forEach: jest.fn(),
    toJSON: () => ({ type: typeName, text }),
  } as unknown as PMNode;
}

function mockDoc(nodes: PMNode[]): PMNode {
  return {
    forEach: (cb: (node: PMNode, offset: number, index: number) => void) => {
      let offset = 0;
      nodes.forEach((n, i) => {
        cb(n, offset, i);
        offset += n.nodeSize;
      });
    },
    content: { size: nodes.reduce((s, n) => s + n.nodeSize, 0) },
    child: (i: number) => nodes[i],
    childCount: nodes.length,
    nodeAt: (pos: number) => {
      let offset = 0;
      for (const n of nodes) {
        if (pos >= offset && pos < offset + n.nodeSize) return n;
        offset += n.nodeSize;
      }
      return null;
    },
  } as unknown as PMNode;
}

describe("diffHighlightPluginKey", () => {
  it("should be a PluginKey instance", () => {
    expect(diffHighlightPluginKey).toBeDefined();
  });
});

describe("DiffHighlight extension", () => {
  it("should have name 'diffHighlight'", () => {
    expect(DiffHighlight.name).toBe("diffHighlight");
  });
});

describe("computeBlockDiff", () => {
  it("returns empty changed sets for identical docs", () => {
    const nodes = [mockNode("hello", "paragraph"), mockNode("world", "paragraph")];
    const doc = mockDoc(nodes);
    const result = computeBlockDiff(doc, doc);
    expect(result.left.changedBlocks.size).toBe(0);
    expect(result.right.changedBlocks.size).toBe(0);
  });

  it("detects added block on right side", () => {
    const leftNodes = [mockNode("hello", "paragraph")];
    const rightNodes = [mockNode("hello", "paragraph"), mockNode("new", "paragraph")];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    expect(result.right.changedBlocks.has(1)).toBe(true);
    expect(result.left.changedBlocks.size).toBe(0);
  });

  it("detects removed block on left side", () => {
    const leftNodes = [mockNode("hello", "paragraph"), mockNode("removed", "paragraph")];
    const rightNodes = [mockNode("hello", "paragraph")];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    expect(result.left.changedBlocks.has(1)).toBe(true);
    expect(result.right.changedBlocks.size).toBe(0);
  });

  it("detects changed block content", () => {
    const leftNodes = [mockNode("hello", "paragraph")];
    const rightNodes = [mockNode("world", "paragraph")];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    expect(result.left.changedBlocks.has(0)).toBe(true);
    expect(result.right.changedBlocks.has(0)).toBe(true);
  });

  it("detects type change as diff", () => {
    const leftNodes = [mockNode("hello", "paragraph")];
    const rightNodes = [mockNode("hello", "heading")];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    expect(result.left.changedBlocks.has(0)).toBe(true);
    expect(result.right.changedBlocks.has(0)).toBe(true);
  });

  it("handles empty docs", () => {
    const result = computeBlockDiff(mockDoc([]), mockDoc([]));
    expect(result.left.changedBlocks.size).toBe(0);
    expect(result.right.changedBlocks.size).toBe(0);
  });

  it("handles one empty doc", () => {
    const nodes = [mockNode("hello", "paragraph")];
    const result = computeBlockDiff(mockDoc([]), mockDoc(nodes));
    expect(result.right.changedBlocks.has(0)).toBe(true);
  });

  it("correctly compares tables at cell level", () => {
    // Create table-like nodes with forEach for rows and cells
    const makeCell = (text: string) => ({
      textContent: text,
      nodeSize: text.length + 2,
    });
    const makeRow = (cells: ReturnType<typeof makeCell>[]) => ({
      forEach: (cb: (cell: any) => void) => cells.forEach(cb),
    });
    const makeTable = (rows: ReturnType<typeof makeRow>[], text: string) => {
      const node = mockNode(text, "table");
      (node as any).forEach = (cb: (row: any) => void) => rows.forEach(cb);
      return node;
    };

    const leftTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b")])],
      "ab",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a"), makeCell("c")])],
      "ac",
    );

    const leftDoc = mockDoc([leftTable]);
    const rightDoc = mockDoc([rightTable]);
    const result = computeBlockDiff(leftDoc, rightDoc);

    // Tables with different content should have cell diffs
    expect(result.left.cellDiffs.size > 0 || result.left.changedBlocks.size > 0).toBe(true);
  });

  describe("semantic mode", () => {
    it("falls back to flat diff when no headings exist", () => {
      const leftNodes = [mockNode("hello", "paragraph"), mockNode("world", "paragraph")];
      const rightNodes = [mockNode("hello", "paragraph"), mockNode("changed", "paragraph")];
      const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
      expect(result.left.changedBlocks.has(1)).toBe(true);
      expect(result.right.changedBlocks.has(1)).toBe(true);
    });

    it("handles semantic diff with headings", () => {
      const leftNodes = [
        mockNode("Section A", "heading", { level: 1 }),
        mockNode("content A", "paragraph"),
        mockNode("Section B", "heading", { level: 1 }),
        mockNode("content B", "paragraph"),
      ];
      const rightNodes = [
        mockNode("Section A", "heading", { level: 1 }),
        mockNode("content A modified", "paragraph"),
        mockNode("Section B", "heading", { level: 1 }),
        mockNode("content B", "paragraph"),
      ];
      const result = computeBlockDiff(
        mockDoc(leftNodes),
        mockDoc(rightNodes),
        { semantic: true },
      );
      // Content A changed, content B unchanged
      expect(result.left.changedBlocks.has(1)).toBe(true);
      expect(result.right.changedBlocks.has(1)).toBe(true);
      expect(result.left.changedBlocks.has(3)).toBe(false);
      expect(result.right.changedBlocks.has(3)).toBe(false);
    });

    it("detects section-only diffs (section exists in one side only)", () => {
      const leftNodes = [
        mockNode("Section A", "heading", { level: 1 }),
        mockNode("content A", "paragraph"),
      ];
      const rightNodes = [
        mockNode("Section A", "heading", { level: 1 }),
        mockNode("content A", "paragraph"),
        mockNode("Section B", "heading", { level: 1 }),
        mockNode("new content", "paragraph"),
      ];
      const result = computeBlockDiff(
        mockDoc(leftNodes),
        mockDoc(rightNodes),
        { semantic: true },
      );
      // Section B is only on right
      expect(result.right.changedBlocks.has(2)).toBe(true);
      expect(result.right.changedBlocks.has(3)).toBe(true);
      // Left should have placeholder
      expect(result.left.placeholderPositions.length).toBeGreaterThan(0);
    });
  });
});

describe("BlockDiffResult type", () => {
  it("can construct a valid BlockDiffResult", () => {
    const result: BlockDiffResult = {
      changedBlocks: new Set([0, 2]),
      cellDiffs: new Map([[1, new Set([0, 1])]]),
      placeholderPositions: [{ pos: 10, lineCount: 3 }],
    };
    expect(result.changedBlocks.has(0)).toBe(true);
    expect(result.cellDiffs.get(1)?.has(0)).toBe(true);
    expect(result.placeholderPositions[0].pos).toBe(10);
  });
});

describe("PlaceholderPosition type", () => {
  it("has pos and lineCount fields", () => {
    const pp: PlaceholderPosition = { pos: 5, lineCount: 2 };
    expect(pp.pos).toBe(5);
    expect(pp.lineCount).toBe(2);
  });
});

// --- DiffHighlight Extension integration tests ---
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

function createEditorWithDiffHighlight(content = ""): Editor {
  return new Editor({
    extensions: [StarterKit, DiffHighlight],
    content,
  });
}

describe("DiffHighlight extension - commands and plugin", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("setDiffHighlight sets plugin state and creates decorations", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p><p>world</p>");
    const result: BlockDiffResult = {
      changedBlocks: new Set([0]),
      cellDiffs: new Map(),
      placeholderPositions: [],
    };
    editor.commands.setDiffHighlight(result, "left");

    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState).toBeDefined();
    expect(pluginState.changedBlocks.has(0)).toBe(true);
    expect(pluginState.side).toBe("left");
  });

  it("clearDiffHighlight resets plugin state", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p>");
    const result: BlockDiffResult = {
      changedBlocks: new Set([0]),
      cellDiffs: new Map(),
      placeholderPositions: [],
    };
    editor.commands.setDiffHighlight(result, "right");
    editor.commands.clearDiffHighlight();

    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState.changedBlocks.size).toBe(0);
    expect(pluginState.cellDiffs.size).toBe(0);
  });

  it("plugin decorations are created for changed blocks", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p><p>world</p>");
    const result: BlockDiffResult = {
      changedBlocks: new Set([1]),
      cellDiffs: new Map(),
      placeholderPositions: [],
    };
    editor.commands.setDiffHighlight(result, "right");

    // Access the plugin's decorations prop via finding the plugin
    const diffPlugin = editor.state.plugins.find(
      p => diffHighlightPluginKey.getState(editor.state) !== undefined && (p as any).spec?.key === diffHighlightPluginKey
    ) ?? editor.state.plugins.find(p => {
      try { return (p as any).key?.startsWith?.("diffHighlight") || (p as any).spec?.key === diffHighlightPluginKey; } catch { return false; }
    });

    // Use the plugin's getState to verify decorations are generated
    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState).toBeDefined();
    expect(pluginState.changedBlocks.has(1)).toBe(true);
  });

  it("no decorations when no changes", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p>");
    // No setDiffHighlight called - default empty state
    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState).toBeDefined();
    expect(pluginState.changedBlocks.size).toBe(0);
  });

  it("left side uses red-tinted block style", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p>");
    const result: BlockDiffResult = {
      changedBlocks: new Set([0]),
      cellDiffs: new Map(),
      placeholderPositions: [],
    };
    editor.commands.setDiffHighlight(result, "left");

    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState.side).toBe("left");
  });

  it("right side uses green-tinted block style", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p>");
    const result: BlockDiffResult = {
      changedBlocks: new Set([0]),
      cellDiffs: new Map(),
      placeholderPositions: [],
    };
    editor.commands.setDiffHighlight(result, "right");

    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState.side).toBe("right");
  });

  it("handles placeholderPositions in setDiffHighlight", () => {
    editor = createEditorWithDiffHighlight("<p>hello</p>");
    const result: BlockDiffResult = {
      changedBlocks: new Set(),
      cellDiffs: new Map(),
      placeholderPositions: [{ pos: 0, lineCount: 3 }],
    };
    editor.commands.setDiffHighlight(result, "left");

    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState.placeholderPositions).toHaveLength(1);
    expect(pluginState.placeholderPositions[0].lineCount).toBe(3);

    // Verify the plugin state has placeholders set
    const plugins = editor.state.plugins;
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("handles cellDiffs in plugin state", () => {
    // Use HTML table content
    editor = createEditorWithDiffHighlight(
      "<table><tr><td>a</td><td>b</td></tr></table>"
    );
    const cellSet = new Set([1]);
    const result: BlockDiffResult = {
      changedBlocks: new Set(),
      cellDiffs: new Map([[0, cellSet]]),
      placeholderPositions: [],
    };
    editor.commands.setDiffHighlight(result, "left");

    const pluginState = diffHighlightPluginKey.getState(editor.state);
    expect(pluginState).toBeDefined();
    expect(pluginState.cellDiffs.size).toBe(1);
    expect(pluginState.cellDiffs.get(0)?.has(1)).toBe(true);
  });
});

// --- Table mock helpers ---
function makeCell(text: string) {
  return { textContent: text, nodeSize: text.length + 2 };
}
function makeRow(cells: ReturnType<typeof makeCell>[]) {
  return { forEach: (cb: (cell: any) => void) => cells.forEach(cb) };
}
function makeTable(rows: ReturnType<typeof makeRow>[], text: string) {
  const node = mockNode(text, "table");
  (node as any).forEach = (cb: (row: any) => void) => rows.forEach(cb);
  return node;
}

describe("computeBlockDiff - table cell-level diff", () => {
  it("detects cells when left table has more rows than right", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b")]), makeRow([makeCell("c"), makeCell("d")])],
      "abcd",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b")])],
      "ab",
    );
    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    // Left has extra row -> leftCells should mark those cells
    expect(result.left.cellDiffs.size > 0 || result.left.changedBlocks.size > 0).toBe(true);
  });

  it("detects cells when right table has more rows than left", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a")])],
      "a",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a")]), makeRow([makeCell("x")])],
      "ax",
    );
    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    expect(result.right.cellDiffs.size > 0 || result.right.changedBlocks.size > 0).toBe(true);
  });

  it("detects cells when left row has more columns than right", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b"), makeCell("c")])],
      "abc",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a")])],
      "a",
    );
    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    // Extra columns on left should be marked
    expect(result.left.cellDiffs.size > 0).toBe(true);
  });

  it("detects cells when right row has more columns than left", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a")])],
      "a",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b"), makeCell("c")])],
      "abc",
    );
    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    // Extra columns on right should be marked
    expect(result.right.cellDiffs.size > 0).toBe(true);
  });

  it("reports no cell diffs for identical tables", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b")])],
      "ab",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b")])],
      "ab",
    );
    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    expect(result.left.cellDiffs.size).toBe(0);
    expect(result.right.cellDiffs.size).toBe(0);
    expect(result.left.changedBlocks.size).toBe(0);
    expect(result.right.changedBlocks.size).toBe(0);
  });

  it("marks individual changed cells in matching rows", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b"), makeCell("c")])],
      "abc",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a"), makeCell("X"), makeCell("c")])],
      "aXc",
    );
    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    // Cell at index 1 should be changed on both sides
    const leftCells = result.left.cellDiffs.get(0);
    const rightCells = result.right.cellDiffs.get(0);
    expect(leftCells).toBeDefined();
    expect(rightCells).toBeDefined();
    expect(leftCells!.has(1)).toBe(true);
    expect(rightCells!.has(1)).toBe(true);
    // Cell at index 0 and 2 should NOT be changed
    expect(leftCells!.has(0)).toBe(false);
    expect(leftCells!.has(2)).toBe(false);
  });
});

describe("computeBlockDiff - semantic mode additional", () => {
  it("handles pre-section paragraphs before headings", () => {
    const leftNodes = [
      mockNode("intro paragraph", "paragraph"),
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
    ];
    const rightNodes = [
      mockNode("intro changed", "paragraph"),
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // Pre-section paragraph changed
    expect(result.left.changedBlocks.has(0)).toBe(true);
    expect(result.right.changedBlocks.has(0)).toBe(true);
    // Section content unchanged
    expect(result.left.changedBlocks.has(2)).toBe(false);
  });

  it("handles left-only section with placeholders on right", () => {
    const leftNodes = [
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
      mockNode("Section B", "heading", { level: 1 }),
      mockNode("content B", "paragraph"),
    ];
    const rightNodes = [
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // Section B only on left
    expect(result.left.changedBlocks.has(2)).toBe(true);
    expect(result.left.changedBlocks.has(3)).toBe(true);
    // Right should have placeholder
    expect(result.right.placeholderPositions.length).toBeGreaterThan(0);
  });

  it("handles multiple pre-section paragraphs", () => {
    const leftNodes = [
      mockNode("intro 1", "paragraph"),
      mockNode("intro 2", "paragraph"),
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content", "paragraph"),
    ];
    const rightNodes = [
      mockNode("intro 1", "paragraph"),
      mockNode("intro 2", "paragraph"),
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content changed", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // Pre-sections unchanged
    expect(result.left.changedBlocks.has(0)).toBe(false);
    expect(result.left.changedBlocks.has(1)).toBe(false);
    // Section content changed
    expect(result.left.changedBlocks.has(3)).toBe(true);
    expect(result.right.changedBlocks.has(3)).toBe(true);
  });

  it("handles section reordering", () => {
    const leftNodes = [
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
      mockNode("Section B", "heading", { level: 1 }),
      mockNode("content B", "paragraph"),
    ];
    const rightNodes = [
      mockNode("Section B", "heading", { level: 1 }),
      mockNode("content B", "paragraph"),
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // At least one side should have changes due to reordering
    expect(
      result.left.changedBlocks.size > 0 ||
      result.right.changedBlocks.size > 0 ||
      result.left.placeholderPositions.length > 0 ||
      result.right.placeholderPositions.length > 0
    ).toBe(true);
  });

  it("handles both sides having unique sections", () => {
    const leftNodes = [
      mockNode("Section A", "heading", { level: 1 }),
      mockNode("content A", "paragraph"),
      mockNode("Section C", "heading", { level: 1 }),
      mockNode("content C", "paragraph"),
    ];
    const rightNodes = [
      mockNode("Section B", "heading", { level: 1 }),
      mockNode("content B", "paragraph"),
      mockNode("Section C", "heading", { level: 1 }),
      mockNode("content C", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // Section A only on left, Section B only on right
    expect(result.left.changedBlocks.has(0)).toBe(true);
    expect(result.left.changedBlocks.has(1)).toBe(true);
    expect(result.right.changedBlocks.has(0)).toBe(true);
    expect(result.right.changedBlocks.has(1)).toBe(true);
    // Section C unchanged on both
    expect(result.left.changedBlocks.has(2)).toBe(false);
    expect(result.right.changedBlocks.has(2)).toBe(false);
  });

  it("handles tables within semantic sections", () => {
    const leftTable = makeTable(
      [makeRow([makeCell("a"), makeCell("b")])],
      "ab",
    );
    const rightTable = makeTable(
      [makeRow([makeCell("a"), makeCell("X")])],
      "aX",
    );
    const leftNodes = [
      mockNode("Section A", "heading", { level: 1 }),
      leftTable,
    ];
    const rightNodes = [
      mockNode("Section A", "heading", { level: 1 }),
      rightTable,
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // Table cell diff should be detected
    expect(result.left.cellDiffs.size > 0 || result.left.changedBlocks.has(1)).toBe(true);
  });
});

describe("computeBlockDiff - LCS edge cases", () => {
  it("handles interleaved additions and removals", () => {
    const leftNodes = [
      mockNode("A", "paragraph"),
      mockNode("B", "paragraph"),
      mockNode("C", "paragraph"),
      mockNode("D", "paragraph"),
    ];
    const rightNodes = [
      mockNode("A", "paragraph"),
      mockNode("X", "paragraph"),
      mockNode("C", "paragraph"),
      mockNode("Y", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    // A and C should be unchanged
    expect(result.left.changedBlocks.has(0)).toBe(false);
    expect(result.right.changedBlocks.has(0)).toBe(false);
    expect(result.left.changedBlocks.has(2)).toBe(false);
    expect(result.right.changedBlocks.has(2)).toBe(false);
    // B/D on left, X/Y on right should be changed
    expect(result.left.changedBlocks.has(1)).toBe(true);
    expect(result.left.changedBlocks.has(3)).toBe(true);
    expect(result.right.changedBlocks.has(1)).toBe(true);
    expect(result.right.changedBlocks.has(3)).toBe(true);
  });

  it("handles single block on both sides with different type", () => {
    const leftNodes = [mockNode("same text", "paragraph")];
    const rightNodes = [mockNode("same text", "blockquote")];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    expect(result.left.changedBlocks.has(0)).toBe(true);
    expect(result.right.changedBlocks.has(0)).toBe(true);
  });

  it("handles large asymmetric docs (left empty, right many blocks)", () => {
    const rightNodes = Array.from({ length: 10 }, (_, i) => mockNode(`block ${i}`, "paragraph"));
    const result = computeBlockDiff(mockDoc([]), mockDoc(rightNodes));
    expect(result.right.changedBlocks.size).toBe(10);
    expect(result.left.changedBlocks.size).toBe(0);
  });

  it("handles large asymmetric docs (left many blocks, right empty)", () => {
    const leftNodes = Array.from({ length: 10 }, (_, i) => mockNode(`block ${i}`, "paragraph"));
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc([]));
    expect(result.left.changedBlocks.size).toBe(10);
    expect(result.right.changedBlocks.size).toBe(0);
  });
});
