/**
 * blockClipboard.ts の追加カバレッジテスト
 * handleBlockClipboardEvent, performBlockCopy, findBlockNode のテスト。
 */
import {
  handleBlockClipboardEvent,
  performBlockCopy,
  findBlockNode,
  setHandledByKeydown,
  setCopiedBlockNode,
  getCopiedBlockNode,
} from "../utils/blockClipboard";

describe("findBlockNode", () => {
  it("returns null when selection has no block node ancestors", () => {
    const mockState = {
      selection: {
        from: 5,
        $from: {
          depth: 1,
          node: jest.fn((d: number) => ({ type: { name: d === 1 ? "paragraph" : "doc" } })),
          before: jest.fn(() => 0),
        },
      },
      doc: {
        nodeAt: jest.fn(() => null),
        resolve: jest.fn(() => ({
          nodeBefore: null,
        })),
        textBetween: jest.fn(() => ""),
      },
    } as any;

    const result = findBlockNode(mockState);
    expect(result).toBeNull();
  });

  it("finds codeBlock ancestor", () => {
    const codeNode = { type: { name: "codeBlock" }, nodeSize: 10 };
    const mockState = {
      selection: {
        from: 5,
        $from: {
          depth: 1,
          node: jest.fn((d: number) => (d === 1 ? codeNode : { type: { name: "doc" } })),
          before: jest.fn(() => 0),
        },
      },
      doc: {
        nodeAt: jest.fn(() => null),
        textBetween: jest.fn(() => "code content"),
      },
    } as any;

    const result = findBlockNode(mockState);
    expect(result).not.toBeNull();
    expect(result!.node).toBe(codeNode);
  });

  it("finds nodeAt cursor position", () => {
    const tableNode = { type: { name: "table" }, nodeSize: 20 };
    const mockState = {
      selection: {
        from: 5,
        $from: {
          depth: 0,
        },
      },
      doc: {
        nodeAt: jest.fn(() => tableNode),
        textBetween: jest.fn(() => "table content"),
      },
    } as any;

    const result = findBlockNode(mockState);
    expect(result).not.toBeNull();
    expect(result!.node).toBe(tableNode);
  });

  it("finds nodeBefore cursor", () => {
    const imageNode = { type: { name: "image" }, nodeSize: 5 };
    const mockState = {
      selection: {
        from: 10,
        $from: {
          depth: 0,
        },
      },
      doc: {
        nodeAt: jest.fn(() => null),
        resolve: jest.fn(() => ({
          nodeBefore: imageNode,
        })),
        textBetween: jest.fn(() => "img"),
      },
    } as any;

    const result = findBlockNode(mockState);
    expect(result).not.toBeNull();
    expect(result!.node).toBe(imageNode);
  });

  it("finds top-level block node", () => {
    const gifNode = { type: { name: "gifBlock" }, nodeSize: 15 };
    const mockState = {
      selection: {
        from: 5,
        $from: {
          depth: 1,
          node: jest.fn((d: number) => (d === 1 ? gifNode : { type: { name: "doc" } })),
          before: jest.fn(() => 0),
        },
      },
      doc: {
        nodeAt: jest.fn(() => null),
        resolve: jest.fn(() => ({
          nodeBefore: null,
        })),
        textBetween: jest.fn(() => "gif"),
      },
    } as any;

    const result = findBlockNode(mockState);
    expect(result).not.toBeNull();
    expect(result!.node).toBe(gifNode);
  });
});

describe("performBlockCopy", () => {
  afterEach(() => {
    setCopiedBlockNode(null);
  });

  it("copies text selection", () => {
    const writeClipboard = jest.fn();
    const mockView = {
      state: {
        selection: { from: 0, to: 5 },
        doc: { textBetween: jest.fn(() => "hello") },
        tr: {
          deleteSelection: jest.fn().mockReturnThis(),
        },
      },
      dispatch: jest.fn(),
    } as any;

    const result = performBlockCopy(mockView, false, writeClipboard);
    expect(result).toBe(true);
    expect(writeClipboard).toHaveBeenCalledWith("hello", null);
    expect(getCopiedBlockNode()).toBeNull();
  });

  it("copies and cuts text selection", () => {
    const writeClipboard = jest.fn();
    const mockView = {
      state: {
        selection: { from: 0, to: 5 },
        doc: { textBetween: jest.fn(() => "hello") },
        tr: {
          deleteSelection: jest.fn().mockReturnThis(),
        },
      },
      dispatch: jest.fn(),
    } as any;

    const result = performBlockCopy(mockView, true, writeClipboard);
    expect(result).toBe(true);
    expect(mockView.dispatch).toHaveBeenCalled();
  });

  it("returns false when no selection and no block node", () => {
    const writeClipboard = jest.fn();
    const mockView = {
      state: {
        selection: {
          from: 5,
          to: 5,
          $from: { depth: 0 },
        },
        doc: {
          nodeAt: jest.fn(() => null),
          resolve: jest.fn(() => ({ nodeBefore: null })),
        },
      },
      dispatch: jest.fn(),
    } as any;

    const result = performBlockCopy(mockView, false, writeClipboard);
    expect(result).toBe(false);
  });
});

describe("handleBlockClipboardEvent", () => {
  afterEach(() => {
    setHandledByKeydown(false);
    setCopiedBlockNode(null);
  });

  it("returns true and resets when handledByKeydown is true", () => {
    setHandledByKeydown(true);
    const mockView = {} as any;
    const mockEvent = { clipboardData: null, preventDefault: jest.fn() } as any;

    const result = handleBlockClipboardEvent(mockView, mockEvent, false);
    expect(result).toBe(true);
  });

  it("returns false when clipboardData is null", () => {
    const mockView = {} as any;
    const mockEvent = { clipboardData: null, preventDefault: jest.fn() } as any;

    const result = handleBlockClipboardEvent(mockView, mockEvent, false);
    expect(result).toBe(false);
  });

  it("returns false for text selection outside block node", () => {
    const mockView = {
      state: {
        selection: {
          from: 0,
          to: 5,
          $from: { depth: 1, node: jest.fn(() => ({ type: { name: "paragraph" } })) },
        },
        doc: { textBetween: jest.fn(() => "hello") },
      },
    } as any;
    const mockEvent = {
      clipboardData: { setData: jest.fn() },
      preventDefault: jest.fn(),
    } as any;

    const result = handleBlockClipboardEvent(mockView, mockEvent, false);
    expect(result).toBe(false);
  });
});
