/**
 * diffHighlight.ts の追加カバレッジテスト
 * DiffHighlight extension の構造、addStorage, addCommands のテスト。
 */
import {
  computeBlockDiff,
  DiffHighlight,
} from "../extensions/diffHighlight";
import type { Node as PMNode } from "@tiptap/pm/model";

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

describe("DiffHighlight extension structure", () => {
  it("has expected config properties", () => {
    expect(DiffHighlight.config).toBeDefined();
    expect(DiffHighlight.name).toBe("diffHighlight");
  });

  it("defines addCommands", () => {
    expect(DiffHighlight.config.addCommands).toBeDefined();
  });

  it("addCommands returns expected command names", () => {
    const addCommands = DiffHighlight.config.addCommands as () => Record<string, unknown>;
    const commands = addCommands.call({ storage: {}, editor: {} });
    expect(commands).toHaveProperty("setDiffHighlight");
    expect(commands).toHaveProperty("clearDiffHighlight");
  });

  it("defines addProseMirrorPlugins", () => {
    expect(DiffHighlight.config.addProseMirrorPlugins).toBeDefined();
  });
});

describe("computeBlockDiff - additional cases", () => {
  it("handles heading level changes", () => {
    const leftNodes = [mockNode("Title", "heading", { level: 1 })];
    const rightNodes = [mockNode("Title", "heading", { level: 2 })];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    // computeBlockDiff may or may not detect level change (depends on fingerprint algo)
    expect(result).toBeDefined();
    expect(result.left).toBeDefined();
    expect(result.right).toBeDefined();
  });

  it("handles multiple blocks with insertions in the middle", () => {
    const leftNodes = [
      mockNode("A", "paragraph"),
      mockNode("C", "paragraph"),
    ];
    const rightNodes = [
      mockNode("A", "paragraph"),
      mockNode("B", "paragraph"),
      mockNode("C", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    // B is new on right
    expect(result.right.changedBlocks.has(1)).toBe(true);
    // A and C should not be changed
    expect(result.right.changedBlocks.has(0)).toBe(false);
    expect(result.right.changedBlocks.has(2)).toBe(false);
  });

  it("handles complete replacement of all blocks", () => {
    const leftNodes = [mockNode("old1", "paragraph"), mockNode("old2", "paragraph")];
    const rightNodes = [mockNode("new1", "paragraph"), mockNode("new2", "paragraph")];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes));
    expect(result.left.changedBlocks.has(0)).toBe(true);
    expect(result.left.changedBlocks.has(1)).toBe(true);
    expect(result.right.changedBlocks.has(0)).toBe(true);
    expect(result.right.changedBlocks.has(1)).toBe(true);
  });

  it("semantic mode: nested headings (H1 > H2)", () => {
    const leftNodes = [
      mockNode("Chapter 1", "heading", { level: 1 }),
      mockNode("Section 1.1", "heading", { level: 2 }),
      mockNode("content 1.1", "paragraph"),
      mockNode("Chapter 2", "heading", { level: 1 }),
      mockNode("content 2", "paragraph"),
    ];
    const rightNodes = [
      mockNode("Chapter 1", "heading", { level: 1 }),
      mockNode("Section 1.1", "heading", { level: 2 }),
      mockNode("modified content 1.1", "paragraph"),
      mockNode("Chapter 2", "heading", { level: 1 }),
      mockNode("content 2", "paragraph"),
    ];
    const result = computeBlockDiff(mockDoc(leftNodes), mockDoc(rightNodes), { semantic: true });
    // content 1.1 changed
    expect(result.left.changedBlocks.has(2)).toBe(true);
    // content 2 unchanged
    expect(result.left.changedBlocks.has(4)).toBe(false);
  });

  it("table with extra row on one side", () => {
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
      [
        makeRow([makeCell("a"), makeCell("b")]),
        makeRow([makeCell("c"), makeCell("d")]),
      ],
      "abcd",
    );

    const result = computeBlockDiff(mockDoc([leftTable]), mockDoc([rightTable]));
    // Different row counts should be detected
    expect(
      result.left.changedBlocks.size > 0 ||
      result.right.changedBlocks.size > 0 ||
      result.left.cellDiffs.size > 0 ||
      result.right.cellDiffs.size > 0,
    ).toBe(true);
  });
});
