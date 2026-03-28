/**
 * blockClipboard.ts - 追加カバレッジテスト (lines 72-73, 102-105, 137-150)
 */
import {
  performBlockCopy,
  handleBlockClipboardEvent,
  setHandledByKeydown,
  setCopiedBlockNode,
  getCopiedBlockNode,
} from "../utils/blockClipboard";

// Mock DOMSerializer for handleBlockClipboardEvent
jest.mock("@tiptap/pm/model", () => ({
  DOMSerializer: {
    fromSchema: () => ({
      serializeNode: () => {
        const el = document.createElement("pre");
        el.textContent = "code content";
        return el;
      },
    }),
  },
}));

describe("blockClipboard coverage2", () => {
  beforeEach(() => {
    setHandledByKeydown(false);
    setCopiedBlockNode(null);
  });

  describe("performBlockCopy - block node copy/cut (lines 102-105)", () => {
    it("copies block node and calls writeClipboard with block info", () => {
      const codeNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const writeClipboard = jest.fn();
      const view = {
        state: {
          selection: {
            from: 3,
            to: 3, // no text selection
            $from: {
              depth: 1,
              node: () => codeNode,
              before: () => 0,
            },
          },
          doc: {
            nodeAt: () => null,
            resolve: () => ({ nodeBefore: null }),
            textBetween: () => "block text",
          },
          tr: { delete: jest.fn().mockReturnThis() },
        },
        dispatch: jest.fn(),
      } as any;

      const result = performBlockCopy(view, false, writeClipboard);
      expect(result).toBe(true);
      expect(getCopiedBlockNode()).toBe(codeNode);
      expect(writeClipboard).toHaveBeenCalledWith("block text", expect.objectContaining({ node: codeNode }));
      expect(view.dispatch).not.toHaveBeenCalled();
    });

    it("cuts block node and dispatches delete", () => {
      const codeNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const deleteFn = jest.fn().mockReturnThis();
      const writeClipboard = jest.fn();
      const view = {
        state: {
          selection: {
            from: 3,
            to: 3,
            $from: {
              depth: 1,
              node: () => codeNode,
              before: () => 0,
            },
          },
          doc: {
            nodeAt: () => null,
            resolve: () => ({ nodeBefore: null }),
            textBetween: () => "block text",
          },
          tr: { delete: deleteFn },
        },
        dispatch: jest.fn(),
      } as any;

      const result = performBlockCopy(view, true, writeClipboard);
      expect(result).toBe(true);
      expect(view.dispatch).toHaveBeenCalled();
      expect(deleteFn).toHaveBeenCalledWith(0, 10);
    });
  });

  describe("handleBlockClipboardEvent - block copy with HTML (lines 137-150)", () => {
    it("copies block node and writes text/html to clipboardData", () => {
      const codeNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const setData = jest.fn();
      const preventDefault = jest.fn();

      const view = {
        state: {
          selection: {
            from: 3,
            to: 3,
            $from: {
              depth: 1,
              node: () => codeNode,
              before: () => 0,
            },
          },
          doc: {
            nodeAt: () => null,
            resolve: () => ({ nodeBefore: null }),
            textBetween: () => "code block text",
          },
          schema: {},
          tr: { delete: jest.fn().mockReturnThis() },
        },
        dispatch: jest.fn(),
      } as any;

      const event = {
        clipboardData: { setData },
        preventDefault,
      } as any;

      const result = handleBlockClipboardEvent(view, event, false);
      expect(result).toBe(true);
      expect(setData).toHaveBeenCalledWith("text/plain", "code block text");
      expect(setData).toHaveBeenCalledWith("text/html", expect.any(String));
      expect(preventDefault).toHaveBeenCalled();
    });

    it("copies text selection inside block node (only text/plain)", () => {
      const setData = jest.fn();
      const preventDefault = jest.fn();

      const view = {
        state: {
          selection: {
            from: 2,
            to: 8,
            $from: {
              depth: 2,
              node: (d: number) =>
                d === 1
                  ? { type: { name: "codeBlock" } }
                  : { type: { name: "paragraph" } },
            },
          },
          doc: {
            textBetween: () => "select",
          },
          schema: {},
          tr: { deleteSelection: jest.fn().mockReturnThis() },
        },
        dispatch: jest.fn(),
      } as any;

      const event = {
        clipboardData: { setData },
        preventDefault,
      } as any;

      const result = handleBlockClipboardEvent(view, event, false);
      expect(result).toBe(true);
      expect(setData).toHaveBeenCalledWith("text/plain", "select");
      expect(preventDefault).toHaveBeenCalled();
    });

    it("cuts block node with clipboardData", () => {
      const codeNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const deleteFn = jest.fn().mockReturnThis();
      const setData = jest.fn();
      const preventDefault = jest.fn();

      const view = {
        state: {
          selection: {
            from: 3,
            to: 3,
            $from: {
              depth: 1,
              node: () => codeNode,
              before: () => 0,
            },
          },
          doc: {
            nodeAt: () => null,
            resolve: () => ({ nodeBefore: null }),
            textBetween: () => "code",
          },
          schema: {},
          tr: { delete: deleteFn },
        },
        dispatch: jest.fn(),
      } as any;

      const event = { clipboardData: { setData }, preventDefault } as any;

      const result = handleBlockClipboardEvent(view, event, true);
      expect(result).toBe(true);
      expect(view.dispatch).toHaveBeenCalled();
    });

    it("returns false when no block and no selection", () => {
      const setData = jest.fn();
      const preventDefault = jest.fn();

      const view = {
        state: {
          selection: {
            from: 5,
            to: 5,
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

      const event = { clipboardData: { setData }, preventDefault } as any;

      const result = handleBlockClipboardEvent(view, event, false);
      expect(result).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });
});
