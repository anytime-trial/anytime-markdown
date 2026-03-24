/**
 * blockGapCursorExtension.ts のテスト
 * BlockGapCursorExtension の構造、ハンドラー関数、各分岐をテスト
 */

// GapCursor をモック - instanceof チェックと new GapCursor() を制御
const mockGapCursorInstances: any[] = [];

class MockGapCursor {
  from: number;
  $from: any;
  empty: boolean;
  constructor($pos: any) {
    this.from = 0;
    this.$from = $pos;
    this.empty = true;
    mockGapCursorInstances.push(this);
  }
}

jest.mock("@tiptap/pm/gapcursor", () => ({
  GapCursor: MockGapCursor,
}));

// TextSelection.near / TextSelection.create をモック
const mockTextSelectionNear = jest.fn().mockReturnValue({ type: "textSelection" });
const mockTextSelectionCreate = jest.fn().mockReturnValue({ type: "textSelectionCreated" });

jest.mock("@tiptap/pm/state", () => {
  const actual = jest.requireActual("@tiptap/pm/state");
  return {
    ...actual,
    TextSelection: {
      near: mockTextSelectionNear,
      create: mockTextSelectionCreate,
    },
  };
});

import { BlockGapCursorExtension } from "../extensions/blockGapCursorExtension";

// --- helpers ---

/** Plugin の keydown ハンドラーを取得 */
function getKeydownHandler(): (view: any, event: any) => boolean {
  const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
  const plugins = addPlugins.call({});
  return plugins[0].props.handleDOMEvents.keydown;
}

/** KeyboardEvent のモックを作成 */
function makeKeyEvent(key: string): KeyboardEvent {
  return { key, preventDefault: jest.fn() } as unknown as KeyboardEvent;
}

/** requestAnimationFrame のモック */
beforeEach(() => {
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  mockGapCursorInstances.length = 0;
  mockTextSelectionNear.mockClear();
  mockTextSelectionCreate.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

// --- Resolve mock builder ---
function makeResolve(overrides: Record<string, any> = {}) {
  return {
    depth: 1,
    parent: { type: { name: "paragraph" } },
    parentOffset: 0,
    after: jest.fn().mockReturnValue(10),
    index: jest.fn().mockReturnValue(1),
    ...overrides,
  };
}

// --- Mock doc builder ---
function makeDoc(overrides: Record<string, any> = {}) {
  return {
    content: { size: 100 },
    resolve: jest.fn().mockReturnValue({}),
    nodeAt: jest.fn().mockReturnValue(null),
    child: jest.fn().mockReturnValue({ type: { name: "paragraph" }, nodeSize: 5 }),
    ...overrides,
  };
}

// --- Mock transaction builder ---
function makeTr(doc?: any) {
  const tr: any = {
    doc: doc ?? makeDoc(),
    setSelection: jest.fn().mockReturnThis(),
    scrollIntoView: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
  };
  return tr;
}

// --- Mock state builder ---
function makeState(overrides: Record<string, any> = {}) {
  const doc = overrides.doc ?? makeDoc();
  const tr = overrides.tr ?? makeTr(doc);
  return {
    doc,
    tr,
    selection: overrides.selection ?? { from: 0, $from: makeResolve(), empty: true },
    schema: overrides.schema ?? {
      nodes: {
        paragraph: { create: jest.fn().mockReturnValue({ nodeSize: 2 }) },
      },
    },
  };
}

// --- Mock view builder ---
function makeView(state: any, overrides: Record<string, any> = {}) {
  return {
    state,
    dispatch: jest.fn(),
    dom: {
      querySelector: jest.fn().mockReturnValue(null),
    },
    endOfTextblock: jest.fn().mockReturnValue(true),
    ...overrides,
  };
}

/** GapCursor selection のモック (instanceof MockGapCursor が true になる) */
function makeGapSelection(pos: number) {
  const sel = new MockGapCursor({});
  sel.from = pos;
  sel.$from = makeResolve();
  sel.empty = true;
  return sel;
}

// ============================
// Structure tests
// ============================
describe("BlockGapCursorExtension structure", () => {
  it("has name 'blockGapCursor'", () => {
    expect(BlockGapCursorExtension.name).toBe("blockGapCursor");
  });

  it("defines addProseMirrorPlugins", () => {
    expect(BlockGapCursorExtension.config.addProseMirrorPlugins).toBeDefined();
  });

  it("addProseMirrorPlugins returns an array with one plugin", () => {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(1);
  });

  it("plugin has handleDOMEvents with keydown handler", () => {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    const plugin = plugins[0];
    expect(plugin.props.handleDOMEvents.keydown).toBeDefined();
  });
});

// ============================
// GapCursor keydown tests
// ============================
describe("handleGapKeydown (GapCursor active)", () => {
  describe("ArrowDown", () => {
    it("moves to after block node when nodeAfter exists and within doc", () => {
      const handler = getKeydownHandler();
      const nodeAfter = { nodeSize: 10, type: { name: "codeBlock" } };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(mockTextSelectionNear).toHaveBeenCalled();
      expect(tr.setSelection).toHaveBeenCalled();
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("does not dispatch when afterBlock exceeds doc size", () => {
      const handler = getKeydownHandler();
      const nodeAfter = { nodeSize: 200, type: { name: "codeBlock" } };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(view.dispatch).not.toHaveBeenCalled();
    });

    it("does nothing when nodeAfter is null", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(null),
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(view.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("ArrowUp", () => {
    it("moves to before gap position when pos > 0", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc({ resolve: jest.fn().mockReturnValue({}) });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(mockTextSelectionNear).toHaveBeenCalled();
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("does not dispatch when pos is 0", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc({ resolve: jest.fn().mockReturnValue({}) });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(0) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(view.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("ArrowRight", () => {
    it("enters non-atom node without preview language", () => {
      const handler = getKeydownHandler();
      const nodeAfter = {
        nodeSize: 10,
        type: { name: "codeBlock" },
        isAtom: false,
        attrs: { language: "javascript" },
      };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(true);
      // Should call TextSelection.near with pos+1 (entering the node)
      expect(doc.resolve).toHaveBeenCalledWith(6);
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("skips preview language codeBlock and moves after", () => {
      const handler = getKeydownHandler();
      const nodeAfter = {
        nodeSize: 10,
        type: { name: "codeBlock" },
        isAtom: false,
        attrs: { language: "mermaid" },
      };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(true);
      // Should call resolve with afterBlock = 5 + 10 = 15
      expect(doc.resolve).toHaveBeenCalledWith(15);
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("skips atom node and moves after", () => {
      const handler = getKeydownHandler();
      const nodeAfter = {
        nodeSize: 10,
        type: { name: "image" },
        isAtom: true,
        attrs: {},
      };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(doc.resolve).toHaveBeenCalledWith(15);
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("returns false when atom node at end of doc", () => {
      const handler = getKeydownHandler();
      const nodeAfter = {
        nodeSize: 200,
        type: { name: "image" },
        isAtom: true,
        attrs: {},
      };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
    });

    it("returns true when nodeAfter is null", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(null),
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(view.dispatch).not.toHaveBeenCalled();
    });

    it("handles each preview language: math, plantuml, html", () => {
      const handler = getKeydownHandler();
      for (const lang of ["math", "plantuml", "html"]) {
        const nodeAfter = {
          nodeSize: 10,
          type: { name: "codeBlock" },
          isAtom: false,
          attrs: { language: lang },
        };
        const doc = makeDoc({
          nodeAt: jest.fn().mockReturnValue(nodeAfter),
          resolve: jest.fn().mockReturnValue({}),
          content: { size: 100 },
        });
        const tr = makeTr(doc);
        const state = makeState({ doc, tr, selection: makeGapSelection(5) });
        const view = makeView(state);
        const event = makeKeyEvent("ArrowRight");

        handler(view, event);
        expect(view.dispatch).toHaveBeenCalled();
      }
    });

    it("enters codeBlock with no language attr (undefined)", () => {
      const handler = getKeydownHandler();
      const nodeAfter = {
        nodeSize: 10,
        type: { name: "codeBlock" },
        isAtom: false,
        attrs: { language: undefined },
      };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(true);
      // enters the node -> pos + 1 = 6
      expect(doc.resolve).toHaveBeenCalledWith(6);
    });

    it("enters non-codeBlock non-atom node (e.g. table)", () => {
      const handler = getKeydownHandler();
      const nodeAfter = {
        nodeSize: 20,
        type: { name: "table" },
        isAtom: false,
        attrs: {},
      };
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(nodeAfter),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(doc.resolve).toHaveBeenCalledWith(6);
    });
  });

  describe("Enter", () => {
    it("inserts paragraph and moves cursor into it", () => {
      const handler = getKeydownHandler();
      const paragraphNode = { nodeSize: 2 };
      const paragraphType = { create: jest.fn().mockReturnValue(paragraphNode) };
      const doc = makeDoc({ resolve: jest.fn().mockReturnValue({}) });
      const tr = makeTr(doc);
      const state = makeState({
        doc,
        tr,
        selection: makeGapSelection(5),
        schema: { nodes: { paragraph: paragraphType } },
      });
      const view = makeView(state);
      const event = makeKeyEvent("Enter");

      const result = handler(view, event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(tr.insert).toHaveBeenCalledWith(5, paragraphNode);
      expect(mockTextSelectionCreate).toHaveBeenCalledWith(tr.doc, 6);
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("returns true even when paragraph type is missing", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc();
      const tr = makeTr(doc);
      const state = makeState({
        doc,
        tr,
        selection: makeGapSelection(5),
        schema: { nodes: {} },
      });
      const view = makeView(state);
      const event = makeKeyEvent("Enter");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(view.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("Other keys", () => {
    it("returns false for unhandled key", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc();
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("Escape");

      const result = handler(view, event);

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it("does not preventDefault for ArrowLeft in gap mode", () => {
      const handler = getKeydownHandler();
      const doc = makeDoc();
      const tr = makeTr(doc);
      const state = makeState({ doc, tr, selection: makeGapSelection(5) });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowLeft");

      const result = handler(view, event);

      expect(result).toBe(false);
      // ArrowLeft is not in GAP_PREVENTABLE_KEYS
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});

// ============================
// Normal keydown tests
// ============================
describe("handleNormalKeydown (normal cursor)", () => {
  describe("ArrowDown", () => {
    it("sets GapCursor when next node is a block type", () => {
      const handler = getKeydownHandler();
      const blockNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(blockNode),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      tr.scrollIntoView = jest.fn().mockReturnValue(tr);
      const state = makeState({
        doc,
        tr,
        selection: { from: 5, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(view.dispatch).toHaveBeenCalled();
      // GapCursor was constructed
      expect(mockGapCursorInstances.length).toBeGreaterThan(0);
    });

    it("returns false when selection is not empty", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve(), empty: false },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when depth < 1", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve({ depth: 0 }), empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when parent is codeBlock", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: {
          from: 5,
          $from: makeResolve({ parent: { type: { name: "codeBlock" } } }),
          empty: true,
        },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when not at end of textblock", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve(), empty: true },
      });
      const view = makeView(state, { endOfTextblock: jest.fn().mockReturnValue(false) });
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when pos >= doc content size", () => {
      const handler = getKeydownHandler();
      const $from = makeResolve({ after: jest.fn().mockReturnValue(100) });
      const doc = makeDoc({ content: { size: 100 } });
      const state = makeState({
        doc,
        selection: { from: 5, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when nodeAfter is null", () => {
      const handler = getKeydownHandler();
      const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue(null),
        content: { size: 100 },
      });
      const state = makeState({
        doc,
        selection: { from: 5, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when nodeAfter is not a block type", () => {
      const handler = getKeydownHandler();
      const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
      const doc = makeDoc({
        nodeAt: jest.fn().mockReturnValue({ type: { name: "paragraph" }, nodeSize: 5 }),
        content: { size: 100 },
      });
      const state = makeState({
        doc,
        selection: { from: 5, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowDown");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("handles each block node type: image, gifBlock, table", () => {
      const handler = getKeydownHandler();
      for (const typeName of ["image", "gifBlock", "table"]) {
        mockGapCursorInstances.length = 0;
        const blockNode = { type: { name: typeName }, nodeSize: 10 };
        const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
        const doc = makeDoc({
          nodeAt: jest.fn().mockReturnValue(blockNode),
          resolve: jest.fn().mockReturnValue({}),
          content: { size: 100 },
        });
        const tr = makeTr(doc);
        tr.scrollIntoView = jest.fn().mockReturnValue(tr);
        const state = makeState({
          doc,
          tr,
          selection: { from: 5, $from, empty: true },
        });
        const view = makeView(state);
        const event = makeKeyEvent("ArrowDown");

        const result = handler(view, event);
        expect(result).toBe(true);
      }
    });
  });

  describe("ArrowUp", () => {
    it("sets GapCursor when prev node is a block type", () => {
      const handler = getKeydownHandler();
      const prevNode = { type: { name: "image" }, nodeSize: 5 };
      const $from = makeResolve({
        index: jest.fn().mockReturnValue(1),
        parentOffset: 0,
      });
      const doc = makeDoc({
        child: jest.fn().mockReturnValue(prevNode),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      tr.scrollIntoView = jest.fn().mockReturnValue(tr);
      const state = makeState({
        doc,
        tr,
        selection: { from: 5, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("returns false when selection is not empty", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve(), empty: false },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when depth < 1", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve({ depth: 0 }), empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when parent is codeBlock", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: {
          from: 5,
          $from: makeResolve({ parent: { type: { name: "codeBlock" } } }),
          empty: true,
        },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when currentIndex <= 0", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: {
          from: 5,
          $from: makeResolve({ index: jest.fn().mockReturnValue(0) }),
          empty: true,
        },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false when prev node is not a block type", () => {
      const handler = getKeydownHandler();
      const $from = makeResolve({ index: jest.fn().mockReturnValue(1) });
      const doc = makeDoc({
        child: jest.fn().mockReturnValue({ type: { name: "paragraph" }, nodeSize: 5 }),
      });
      const state = makeState({
        doc,
        selection: { from: 5, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("calculates prevStart by summing preceding children", () => {
      const handler = getKeydownHandler();
      const prevNode = { type: { name: "table" }, nodeSize: 20 };
      const $from = makeResolve({
        index: jest.fn().mockReturnValue(3),
        parentOffset: 0,
      });
      // children: index 0 (size 5), index 1 (size 10), index 2 (prevNode)
      const doc = makeDoc({
        child: jest.fn().mockImplementation((i: number) => {
          if (i === 0) return { type: { name: "paragraph" }, nodeSize: 5 };
          if (i === 1) return { type: { name: "paragraph" }, nodeSize: 10 };
          return prevNode;
        }),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      tr.scrollIntoView = jest.fn().mockReturnValue(tr);
      const state = makeState({
        doc,
        tr,
        selection: { from: 50, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowUp");

      const result = handler(view, event);

      expect(result).toBe(true);
      // prevStart = child(0).nodeSize + child(1).nodeSize = 5 + 10 = 15
      expect(doc.resolve).toHaveBeenCalledWith(15);
    });
  });

  describe("ArrowLeft", () => {
    it("sets GapCursor when at start of textblock (parentOffset 0)", () => {
      const handler = getKeydownHandler();
      const prevNode = { type: { name: "codeBlock" }, nodeSize: 8 };
      const $from = makeResolve({
        index: jest.fn().mockReturnValue(1),
        parentOffset: 0,
      });
      const doc = makeDoc({
        child: jest.fn().mockReturnValue(prevNode),
        resolve: jest.fn().mockReturnValue({}),
        content: { size: 100 },
      });
      const tr = makeTr(doc);
      tr.scrollIntoView = jest.fn().mockReturnValue(tr);
      const state = makeState({
        doc,
        tr,
        selection: { from: 8, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowLeft");

      const result = handler(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("returns false when parentOffset > 0", () => {
      const handler = getKeydownHandler();
      const $from = makeResolve({
        index: jest.fn().mockReturnValue(1),
        parentOffset: 5,
      });
      const state = makeState({
        selection: { from: 8, $from, empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowLeft");

      const result = handler(view, event);
      expect(result).toBe(false);
    });
  });

  describe("Other keys", () => {
    it("returns false for unhandled key like Escape", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve(), empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("Escape");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false for Enter key in normal mode", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve(), empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("Enter");

      const result = handler(view, event);
      expect(result).toBe(false);
    });

    it("returns false for ArrowRight key in normal mode", () => {
      const handler = getKeydownHandler();
      const state = makeState({
        selection: { from: 5, $from: makeResolve(), empty: true },
      });
      const view = makeView(state);
      const event = makeKeyEvent("ArrowRight");

      const result = handler(view, event);
      expect(result).toBe(false);
    });
  });
});

// ============================
// adjustGapCursorPosition tests
// ============================
describe("adjustGapCursorPosition", () => {
  it("positions gapcursor element next to sibling", () => {
    const handler = getKeydownHandler();
    const siblingEl = {
      offsetTop: 100,
      offsetLeft: 50,
      offsetHeight: 30,
    };
    const gapEl = {
      style: { position: "", top: "", left: "", height: "", width: "" },
      nextElementSibling: siblingEl,
    };
    const blockNode = { type: { name: "image" }, nodeSize: 10 };
    const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
    const doc = makeDoc({
      nodeAt: jest.fn().mockReturnValue(blockNode),
      resolve: jest.fn().mockReturnValue({}),
      content: { size: 100 },
    });
    const tr = makeTr(doc);
    tr.scrollIntoView = jest.fn().mockReturnValue(tr);
    const state = makeState({
      doc,
      tr,
      selection: { from: 5, $from, empty: true },
    });
    const view = makeView(state, {
      dom: {
        querySelector: jest.fn().mockReturnValue(gapEl),
      },
    });
    const event = makeKeyEvent("ArrowDown");

    handler(view, event);

    // requestAnimationFrame is sync in test
    expect(gapEl.style.position).toBe("absolute");
    expect(gapEl.style.top).toBe("100px");
    expect(gapEl.style.left).toBe("46px"); // 50 - 4
    expect(gapEl.style.height).toBe("30px");
    expect(gapEl.style.width).toBe("0");
  });

  it("does nothing when gapcursor element is not found", () => {
    const handler = getKeydownHandler();
    const blockNode = { type: { name: "codeBlock" }, nodeSize: 10 };
    const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
    const doc = makeDoc({
      nodeAt: jest.fn().mockReturnValue(blockNode),
      resolve: jest.fn().mockReturnValue({}),
      content: { size: 100 },
    });
    const tr = makeTr(doc);
    tr.scrollIntoView = jest.fn().mockReturnValue(tr);
    const state = makeState({
      doc,
      tr,
      selection: { from: 5, $from, empty: true },
    });
    const view = makeView(state, {
      dom: { querySelector: jest.fn().mockReturnValue(null) },
    });
    const event = makeKeyEvent("ArrowDown");

    // Should not throw
    expect(() => handler(view, event)).not.toThrow();
  });

  it("does nothing when sibling is not found", () => {
    const handler = getKeydownHandler();
    const gapEl = {
      style: { position: "", top: "", left: "", height: "", width: "" },
      nextElementSibling: null,
    };
    const blockNode = { type: { name: "gifBlock" }, nodeSize: 10 };
    const $from = makeResolve({ after: jest.fn().mockReturnValue(10) });
    const doc = makeDoc({
      nodeAt: jest.fn().mockReturnValue(blockNode),
      resolve: jest.fn().mockReturnValue({}),
      content: { size: 100 },
    });
    const tr = makeTr(doc);
    tr.scrollIntoView = jest.fn().mockReturnValue(tr);
    const state = makeState({
      doc,
      tr,
      selection: { from: 5, $from, empty: true },
    });
    const view = makeView(state, {
      dom: { querySelector: jest.fn().mockReturnValue(gapEl) },
    });
    const event = makeKeyEvent("ArrowDown");

    expect(() => handler(view, event)).not.toThrow();
    expect(gapEl.style.position).toBe(""); // unchanged
  });

  it("calls adjustGapCursorPosition via ArrowUp path", () => {
    const handler = getKeydownHandler();
    const siblingEl = {
      offsetTop: 200,
      offsetLeft: 30,
      offsetHeight: 40,
    };
    const gapEl = {
      style: { position: "", top: "", left: "", height: "", width: "" },
      nextElementSibling: siblingEl,
    };
    const prevNode = { type: { name: "table" }, nodeSize: 10 };
    const $from = makeResolve({
      index: jest.fn().mockReturnValue(1),
      parentOffset: 0,
    });
    const doc = makeDoc({
      child: jest.fn().mockReturnValue(prevNode),
      resolve: jest.fn().mockReturnValue({}),
      content: { size: 100 },
    });
    const tr = makeTr(doc);
    tr.scrollIntoView = jest.fn().mockReturnValue(tr);
    const state = makeState({
      doc,
      tr,
      selection: { from: 20, $from, empty: true },
    });
    const view = makeView(state, {
      dom: { querySelector: jest.fn().mockReturnValue(gapEl) },
    });
    const event = makeKeyEvent("ArrowUp");

    handler(view, event);

    expect(gapEl.style.position).toBe("absolute");
    expect(gapEl.style.top).toBe("200px");
    expect(gapEl.style.left).toBe("26px");
    expect(gapEl.style.height).toBe("40px");
  });

  it("calls adjustGapCursorPosition via ArrowLeft path", () => {
    const handler = getKeydownHandler();
    const siblingEl = {
      offsetTop: 50,
      offsetLeft: 10,
      offsetHeight: 20,
    };
    const gapEl = {
      style: { position: "", top: "", left: "", height: "", width: "" },
      nextElementSibling: siblingEl,
    };
    const prevNode = { type: { name: "image" }, nodeSize: 10 };
    const $from = makeResolve({
      index: jest.fn().mockReturnValue(1),
      parentOffset: 0,
    });
    const doc = makeDoc({
      child: jest.fn().mockReturnValue(prevNode),
      resolve: jest.fn().mockReturnValue({}),
      content: { size: 100 },
    });
    const tr = makeTr(doc);
    tr.scrollIntoView = jest.fn().mockReturnValue(tr);
    const state = makeState({
      doc,
      tr,
      selection: { from: 15, $from, empty: true },
    });
    const view = makeView(state, {
      dom: { querySelector: jest.fn().mockReturnValue(gapEl) },
    });
    const event = makeKeyEvent("ArrowLeft");

    handler(view, event);

    expect(gapEl.style.position).toBe("absolute");
    expect(gapEl.style.top).toBe("50px");
    expect(gapEl.style.left).toBe("6px");
    expect(gapEl.style.height).toBe("20px");
  });
});
