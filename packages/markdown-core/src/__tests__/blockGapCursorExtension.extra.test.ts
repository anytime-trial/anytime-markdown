/**
 * blockGapCursorExtension.ts の追加カバレッジテスト
 * keydown ハンドラのブランチ: ArrowDown, ArrowUp, ArrowRight, Enter,
 * handleNormalKeydown のブランチをテスト。
 */
import { BlockGapCursorExtension } from "../extensions/blockGapCursorExtension";

describe("BlockGapCursorExtension - keydown handler", () => {
  function getKeydownHandler() {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    return plugins[0].props.handleDOMEvents.keydown;
  }

  // Normal cursor (non-GapCursor) tests
  it("returns false for normal selection with non-navigation key", () => {
    const handler = getKeydownHandler();
    const mockState = {
      selection: { from: 5, empty: true, $from: { depth: 0 } },
    };
    const mockView = { state: mockState };
    const event = { key: "a", preventDefault: jest.fn() };

    const result = handler(mockView, event);
    expect(result).toBe(false);
  });

  it("returns false for ArrowDown when not at block boundary", () => {
    const handler = getKeydownHandler();
    const mockState = {
      selection: {
        from: 5,
        empty: true,
        $from: {
          depth: 1,
          parent: { type: { name: "paragraph" } },
          after: jest.fn(() => 10),
          index: jest.fn(() => 0),
          node: jest.fn(() => ({ type: { name: "paragraph" } })),
          before: jest.fn(() => 0),
        },
      },
      doc: {
        content: { size: 20 },
        nodeAt: jest.fn(() => ({ type: { name: "paragraph" } })),
        child: jest.fn(() => ({ type: { name: "paragraph" }, nodeSize: 5 })),
        resolve: jest.fn(() => ({})),
      },
      tr: { setSelection: jest.fn().mockReturnThis(), scrollIntoView: jest.fn().mockReturnThis() },
    };

    const mockView = {
      state: mockState,
      dom: document.createElement("div"),
      endOfTextblock: jest.fn(() => false),
      dispatch: jest.fn(),
    };

    const event = { key: "ArrowDown", preventDefault: jest.fn() };
    const result = handler(mockView, event);
    expect(result).toBe(false);
  });

  it("returns false for ArrowUp when selection is not inside a block", () => {
    const handler = getKeydownHandler();
    const mockState = {
      selection: {
        from: 5,
        empty: true,
        $from: {
          depth: 0,
          parent: { type: { name: "doc" } },
          index: jest.fn(() => 0),
        },
      },
    };

    const mockView = { state: mockState, dispatch: jest.fn() };
    const event = { key: "ArrowUp", preventDefault: jest.fn() };

    const result = handler(mockView, event);
    expect(result).toBe(false);
  });

  it("returns false for ArrowLeft when parentOffset > 0", () => {
    const handler = getKeydownHandler();
    const mockState = {
      selection: {
        from: 5,
        empty: true,
        $from: {
          depth: 1,
          parent: { type: { name: "paragraph" } },
          parentOffset: 3,
          index: jest.fn(() => 1),
        },
      },
    };

    const mockView = { state: mockState, dispatch: jest.fn() };
    const event = { key: "ArrowLeft", preventDefault: jest.fn() };

    const result = handler(mockView, event);
    expect(result).toBe(false);
  });
});

describe("BlockGapCursorExtension - structure", () => {
  it("plugin key is 'blockGapCursor'", () => {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    expect(plugins[0].key).toContain("blockGapCursor");
  });
});

describe("BlockGapCursorExtension - normal ArrowDown at codeBlock", () => {
  function getHandler() {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    return plugins[0].props.handleDOMEvents.keydown;
  }

  it("returns false when parent is codeBlock", () => {
    const handler = getHandler();
    const mockState = {
      selection: {
        from: 5,
        empty: true,
        $from: {
          depth: 1,
          parent: { type: { name: "codeBlock" } },
        },
      },
    };
    const mockView = { state: mockState, endOfTextblock: jest.fn() };
    const event = { key: "ArrowDown", preventDefault: jest.fn() };
    const result = handler(mockView, event);
    expect(result).toBe(false);
  });

  it("returns false for non-empty selection on ArrowDown", () => {
    const handler = getHandler();
    const mockState = {
      selection: {
        from: 5,
        empty: false,
        $from: {
          depth: 1,
          parent: { type: { name: "paragraph" } },
        },
      },
    };
    const mockView = { state: mockState };
    const event = { key: "ArrowDown", preventDefault: jest.fn() };
    const result = handler(mockView, event);
    expect(result).toBe(false);
  });
});
