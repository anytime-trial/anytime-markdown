/**
 * blockClipboard.ts のカバレッジテスト
 */
import {
  BLOCK_NODE_TYPES,
  setHandledByKeydown,
  getCopiedBlockNode,
  setCopiedBlockNode,
  performBlockCopy,
  handleBlockClipboardEvent,
  findBlockNode,
} from "../utils/blockClipboard";

describe("blockClipboard", () => {
  describe("BLOCK_NODE_TYPES", () => {
    it("contains expected types", () => {
      expect(BLOCK_NODE_TYPES.has("codeBlock")).toBe(true);
      expect(BLOCK_NODE_TYPES.has("table")).toBe(true);
      expect(BLOCK_NODE_TYPES.has("gifBlock")).toBe(true);
      expect(BLOCK_NODE_TYPES.has("image")).toBe(true);
      expect(BLOCK_NODE_TYPES.has("paragraph")).toBe(false);
    });
  });

  describe("copiedBlockNode getter/setter", () => {
    it("defaults to null", () => {
      setCopiedBlockNode(null);
      expect(getCopiedBlockNode()).toBeNull();
    });

    it("stores and retrieves a node", () => {
      const fakeNode = { type: { name: "codeBlock" } } as any;
      setCopiedBlockNode(fakeNode);
      expect(getCopiedBlockNode()).toBe(fakeNode);
      setCopiedBlockNode(null);
    });
  });

  describe("setHandledByKeydown", () => {
    it("sets and resets the flag", () => {
      setHandledByKeydown(true);
      setHandledByKeydown(false);
      // No error - flag is internal
    });
  });

  describe("findBlockNode", () => {
    it("returns null for simple paragraph state", () => {
      const mockState = {
        selection: {
          from: 1,
          $from: {
            depth: 1,
            node: (d: number) => ({ type: { name: d === 1 ? "paragraph" : "doc" } }),
            before: (d: number) => 0,
          },
        },
        doc: {
          nodeAt: () => null,
          resolve: () => ({ nodeBefore: null }),
          textBetween: () => "",
        },
      } as any;
      expect(findBlockNode(mockState)).toBeNull();
    });

    it("finds block node in ancestor", () => {
      const codeNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const mockState = {
        selection: {
          from: 5,
          $from: {
            depth: 2,
            node: (d: number) => d === 1 ? codeNode : { type: { name: "paragraph" } },
            before: (d: number) => 0,
          },
        },
        doc: {
          textBetween: () => "code text",
        },
      } as any;
      const result = findBlockNode(mockState);
      expect(result).not.toBeNull();
      expect(result!.node).toBe(codeNode);
    });

    it("finds block node at cursor position", () => {
      const tableNode = { type: { name: "table" }, nodeSize: 20 };
      const mockState = {
        selection: {
          from: 5,
          $from: {
            depth: 1,
            node: () => ({ type: { name: "paragraph" } }),
            before: () => 0,
          },
        },
        doc: {
          nodeAt: (pos: number) => pos === 5 ? tableNode : null,
          textBetween: () => "table text",
        },
      } as any;
      const result = findBlockNode(mockState);
      expect(result).not.toBeNull();
      expect(result!.node).toBe(tableNode);
    });

    it("finds block node before cursor", () => {
      const imgNode = { type: { name: "image" }, nodeSize: 5 };
      const mockState = {
        selection: {
          from: 10,
          $from: {
            depth: 1,
            node: () => ({ type: { name: "paragraph" } }),
            before: () => 0,
          },
        },
        doc: {
          nodeAt: () => null,
          resolve: () => ({ nodeBefore: imgNode }),
          textBetween: () => "img",
        },
      } as any;
      const result = findBlockNode(mockState);
      expect(result).not.toBeNull();
      expect(result!.node).toBe(imgNode);
    });
  });

  describe("performBlockCopy", () => {
    it("copies text selection and clears block node", () => {
      const writeClipboard = jest.fn();
      const deleteSelection = jest.fn().mockReturnThis();
      const view = {
        state: {
          selection: { from: 0, to: 5 },
          doc: { textBetween: () => "hello" },
          tr: { deleteSelection },
        },
        dispatch: jest.fn(),
      } as any;

      const result = performBlockCopy(view, false, writeClipboard);
      expect(result).toBe(true);
      expect(writeClipboard).toHaveBeenCalledWith("hello", null);
      expect(getCopiedBlockNode()).toBeNull();
    });

    it("cuts text selection", () => {
      const writeClipboard = jest.fn();
      const deleteSelection = jest.fn().mockReturnThis();
      const view = {
        state: {
          selection: { from: 0, to: 5 },
          doc: { textBetween: () => "hello" },
          tr: { deleteSelection },
        },
        dispatch: jest.fn(),
      } as any;

      performBlockCopy(view, true, writeClipboard);
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("returns false when no block node found and no selection", () => {
      const writeClipboard = jest.fn();
      const view = {
        state: {
          selection: {
            from: 1,
            to: 1,
            $from: {
              depth: 1,
              node: () => ({ type: { name: "paragraph" } }),
              before: () => 0,
            },
          },
          doc: {
            nodeAt: () => null,
            resolve: () => ({ nodeBefore: null }),
            textBetween: () => "",
          },
        },
        dispatch: jest.fn(),
      } as any;

      const result = performBlockCopy(view, false, writeClipboard);
      expect(result).toBe(false);
    });
  });

  describe("handleBlockClipboardEvent", () => {
    it("returns true and resets flag when handledByKeydown is set", () => {
      setHandledByKeydown(true);
      const view = {} as any;
      const event = { clipboardData: {} } as any;
      const result = handleBlockClipboardEvent(view, event, false);
      expect(result).toBe(true);
    });

    it("returns false when clipboardData is null", () => {
      setHandledByKeydown(false);
      const view = {
        state: { selection: { from: 0, to: 0 } },
      } as any;
      const event = { clipboardData: null } as any;
      const result = handleBlockClipboardEvent(view, event, false);
      expect(result).toBe(false);
    });

    it("returns false for text selection outside block node", () => {
      setHandledByKeydown(false);
      const view = {
        state: {
          selection: {
            from: 0,
            to: 5,
            $from: {
              depth: 1,
              node: () => ({ type: { name: "paragraph" } }),
            },
          },
        },
      } as any;
      const event = { clipboardData: { setData: jest.fn() } } as any;
      const result = handleBlockClipboardEvent(view, event, false);
      expect(result).toBe(false);
    });
  });
});
