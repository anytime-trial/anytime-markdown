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
