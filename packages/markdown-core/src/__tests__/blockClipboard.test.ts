import {
  BLOCK_NODE_TYPES,
  setHandledByKeydown,
  getCopiedBlockNode,
  setCopiedBlockNode,
  findBlockNode,
  performBlockCopy,
} from "../utils/blockClipboard";

describe("blockClipboard ユーティリティ", () => {
  describe("BLOCK_NODE_TYPES", () => {
    test("codeBlock を含む", () => {
      expect(BLOCK_NODE_TYPES.has("codeBlock")).toBe(true);
    });

    test("table を含む", () => {
      expect(BLOCK_NODE_TYPES.has("table")).toBe(true);
    });

    test("gifBlock を含む", () => {
      expect(BLOCK_NODE_TYPES.has("gifBlock")).toBe(true);
    });

    test("image を含む", () => {
      expect(BLOCK_NODE_TYPES.has("image")).toBe(true);
    });

    test("要素数が 4 である", () => {
      expect(BLOCK_NODE_TYPES.size).toBe(4);
    });
  });

  describe("setCopiedBlockNode / getCopiedBlockNode", () => {
    afterEach(() => {
      setCopiedBlockNode(null);
    });

    test("null を設定すると null を返す", () => {
      setCopiedBlockNode(null);
      expect(getCopiedBlockNode()).toBeNull();
    });

    test("モックノードを設定すると同じ参照を返す", () => {
      const mockNode = {} as any;
      setCopiedBlockNode(mockNode);
      expect(getCopiedBlockNode()).toBe(mockNode);
    });
  });

  describe("setHandledByKeydown", () => {
    test("true を渡しても例外が発生しない", () => {
      expect(() => setHandledByKeydown(true)).not.toThrow();
    });

    test("false を渡しても例外が発生しない", () => {
      expect(() => setHandledByKeydown(false)).not.toThrow();
    });
  });

  describe("findBlockNode", () => {
    test("ブロックノードが見つからない場合は null を返す", () => {
      const mockState = {
        selection: {
          $from: {
            depth: 0,
            node: () => ({ type: { name: "paragraph" } }),
            before: () => 0,
          },
          from: 0,
        },
        doc: {
          nodeAt: () => null,
          resolve: () => ({ nodeBefore: null }),
        },
      } as any;
      expect(findBlockNode(mockState)).toBeNull();
    });

    test("カーソル位置にブロックノードがある場合はそれを返す", () => {
      const mockNode = { type: { name: "codeBlock" }, nodeSize: 10 };
      const mockState = {
        selection: {
          $from: {
            depth: 0,
            node: () => ({ type: { name: "doc" } }),
          },
          from: 5,
        },
        doc: {
          nodeAt: () => mockNode,
          textBetween: () => "some code",
        },
      } as any;
      const result = findBlockNode(mockState);
      expect(result).not.toBeNull();
      expect(result!.node).toBe(mockNode);
      expect(result!.text).toBe("some code");
    });
  });

  describe("performBlockCopy", () => {
    test("テキスト選択がある場合はテキストをコピーする", () => {
      const writeClipboard = jest.fn();
      const mockView = {
        state: {
          selection: { from: 5, to: 10 },
          doc: {
            textBetween: () => "hello",
          },
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

    test("テキスト選択がありカットの場合は削除も実行する", () => {
      const writeClipboard = jest.fn();
      const deleteSel = jest.fn().mockReturnThis();
      const mockView = {
        state: {
          selection: { from: 5, to: 10 },
          doc: {
            textBetween: () => "hello",
          },
          tr: {
            deleteSelection: deleteSel,
          },
        },
        dispatch: jest.fn(),
      } as any;

      const result = performBlockCopy(mockView, true, writeClipboard);
      expect(result).toBe(true);
      expect(deleteSel).toHaveBeenCalled();
      expect(mockView.dispatch).toHaveBeenCalled();
    });
  });
});
