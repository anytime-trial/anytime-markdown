/**
 * useBlockMergeCompare.ts coverage test
 * Targets uncovered lines: nearly all (37.25% covered)
 * Tests the hook logic including merge/compare modes and handleMergeApply
 */
import { renderHook, act } from "@testing-library/react";

// Mock the MergeEditorsContext
const mockGetMergeEditors = jest.fn();
const mockFindCounterpartCode = jest.fn();
const mockGetCodeBlockIndex = jest.fn();
const mockFindCodeBlockByIndex = jest.fn();

jest.mock("../contexts/MergeEditorsContext", () => ({
  getMergeEditors: () => mockGetMergeEditors(),
  findCounterpartCode: (...args: any[]) => mockFindCounterpartCode(...args),
  getCodeBlockIndex: (...args: any[]) => mockGetCodeBlockIndex(...args),
  findCodeBlockByIndex: (...args: any[]) => mockFindCodeBlockByIndex(...args),
}));

import { useBlockMergeCompare } from "../hooks/useBlockMergeCompare";

function createMockEditor(id: string = "editor") {
  const trMock = {
    replaceWith: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  const chainMock: any = {
    command: jest.fn((cb: any) => {
      cb({ tr: trMock });
      return chainMock;
    }),
    run: jest.fn(),
  };
  return {
    id,
    chain: jest.fn().mockReturnValue(chainMock),
    schema: {
      text: jest.fn((str: string) => ({ text: str })),
    },
    state: {
      doc: {
        descendants: jest.fn(),
      },
    },
    _chain: chainMock,
    _tr: trMock,
  } as any;
}

describe("useBlockMergeCompare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns non-compare mode when mergeEditors is null", () => {
    mockGetMergeEditors.mockReturnValue(null);

    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useBlockMergeCompare({
        editor,
        getPos: () => 0,
        language: "mermaid",
        code: "graph TD; A-->B",
        editOpen: false,
      }),
    );

    expect(result.current.isCompareMode).toBe(false);
    expect(result.current.compareCode).toBeNull();
    expect(result.current.thisCode).toBe("graph TD; A-->B");
  });

  it("returns compare mode when mergeEditors is present", () => {
    const leftEditor = createMockEditor("left");
    const rightEditor = createMockEditor("right");
    mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
    mockFindCounterpartCode.mockReturnValue(null);

    const { result } = renderHook(() =>
      useBlockMergeCompare({
        editor: rightEditor, // not the left (compare) editor
        getPos: () => 0,
        language: "mermaid",
        code: "graph TD; A-->B",
        editOpen: false,
      }),
    );

    expect(result.current.isCompareMode).toBe(true);
  });

  it("returns counterpart code when editOpen and editor is the edit editor (rightEditor)", () => {
    const leftEditor = createMockEditor("left");
    const rightEditor = createMockEditor("right");
    mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
    mockFindCounterpartCode.mockReturnValue("counterpart code");

    const { result } = renderHook(() =>
      useBlockMergeCompare({
        editor: rightEditor,
        getPos: () => 0,
        language: "mermaid",
        code: "my code",
        editOpen: true,
      }),
    );

    // rightEditor is NOT the leftEditor (compare editor), so:
    // thisCode = code (since not compare editor)
    // compareCode = counterpartCode
    expect(result.current.thisCode).toBe("my code");
    expect(result.current.compareCode).toBe("counterpart code");
  });

  it("swaps thisCode/compareCode when editor is the compare editor (leftEditor)", () => {
    const leftEditor = createMockEditor("left");
    const rightEditor = createMockEditor("right");
    mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
    mockFindCounterpartCode.mockReturnValue("edit side code");

    const { result } = renderHook(() =>
      useBlockMergeCompare({
        editor: leftEditor, // this IS the compare editor
        getPos: () => 0,
        language: "mermaid",
        code: "compare side code",
        editOpen: true,
      }),
    );

    // leftEditor IS the compare editor, counterpartCode != null, so:
    // thisCode = counterpartCode (edit side)
    // compareCode = code (compare side)
    expect(result.current.thisCode).toBe("edit side code");
    expect(result.current.compareCode).toBe("compare side code");
  });

  it("returns null compareCode when editOpen is false", () => {
    const leftEditor = createMockEditor("left");
    const rightEditor = createMockEditor("right");
    mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });

    const { result } = renderHook(() =>
      useBlockMergeCompare({
        editor: rightEditor,
        getPos: () => 0,
        language: "mermaid",
        code: "my code",
        editOpen: false,
      }),
    );

    expect(result.current.compareCode).toBeNull();
  });

  it("calls getCodeBlockIndex when editOpen and mergeEditors present", () => {
    const leftEditor = createMockEditor("left");
    const rightEditor = createMockEditor("right");
    mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
    mockFindCounterpartCode.mockReturnValue(null);
    mockGetCodeBlockIndex.mockReturnValue(2);

    renderHook(() =>
      useBlockMergeCompare({
        editor: rightEditor,
        getPos: () => 0,
        language: "mermaid",
        code: "my code",
        editOpen: true,
      }),
    );

    expect(mockGetCodeBlockIndex).toHaveBeenCalledWith(rightEditor, "mermaid", "my code");
  });

  describe("handleMergeApply", () => {
    it("does nothing when mergeEditors is null", () => {
      mockGetMergeEditors.mockReturnValue(null);

      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useBlockMergeCompare({
          editor,
          getPos: () => 0,
          language: "mermaid",
          code: "code",
          editOpen: false,
        }),
      );

      act(() => {
        result.current.handleMergeApply("new code", "new compare");
      });

      expect(editor.chain).not.toHaveBeenCalled();
    });

    it("does nothing when blockIndex is -1", () => {
      const leftEditor = createMockEditor("left");
      const rightEditor = createMockEditor("right");
      mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
      mockFindCounterpartCode.mockReturnValue(null);
      mockGetCodeBlockIndex.mockReturnValue(-1);

      const { result } = renderHook(() =>
        useBlockMergeCompare({
          editor: rightEditor,
          getPos: () => 0,
          language: "mermaid",
          code: "code",
          editOpen: true,
        }),
      );

      act(() => {
        result.current.handleMergeApply("new code", "new compare");
      });

      expect(mockFindCodeBlockByIndex).not.toHaveBeenCalled();
    });

    it("applies code to both editors when edit editor triggers merge", () => {
      const leftEditor = createMockEditor("left");
      const rightEditor = createMockEditor("right");
      mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
      mockFindCounterpartCode.mockReturnValue(null);
      mockGetCodeBlockIndex.mockReturnValue(0);
      mockFindCodeBlockByIndex
        .mockReturnValueOnce({ pos: 10, size: 5 }) // thisBlock
        .mockReturnValueOnce({ pos: 20, size: 5 }); // compareBlock

      const { result } = renderHook(() =>
        useBlockMergeCompare({
          editor: rightEditor, // edit editor (not compare)
          getPos: () => 0,
          language: "mermaid",
          code: "old code",
          editOpen: true,
        }),
      );

      act(() => {
        result.current.handleMergeApply("new edit code", "new compare code");
      });

      // thisEditor = rightEditor (not compare)
      expect(rightEditor.chain).toHaveBeenCalled();
      expect(rightEditor._tr.replaceWith).toHaveBeenCalled();

      // compareEditor = leftEditor
      expect(leftEditor.chain).toHaveBeenCalled();
      expect(leftEditor._tr.replaceWith).toHaveBeenCalled();
    });

    it("applies code to both editors when compare editor triggers merge", () => {
      const leftEditor = createMockEditor("left");
      const rightEditor = createMockEditor("right");
      mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
      mockFindCounterpartCode.mockReturnValue("counterpart");
      mockGetCodeBlockIndex.mockReturnValue(0);
      mockFindCodeBlockByIndex
        .mockReturnValueOnce({ pos: 10, size: 5 })
        .mockReturnValueOnce({ pos: 20, size: 5 });

      const { result } = renderHook(() =>
        useBlockMergeCompare({
          editor: leftEditor, // compare editor (leftEditor)
          getPos: () => 0,
          language: "mermaid",
          code: "compare code",
          editOpen: true,
        }),
      );

      act(() => {
        result.current.handleMergeApply("new edit", "new compare");
      });

      // When isCompare, thisEditor = otherEditor (rightEditor), compareEditor = editor (leftEditor)
      expect(rightEditor.chain).toHaveBeenCalled();
      expect(leftEditor.chain).toHaveBeenCalled();
    });

    it("uses tr.delete when new code is empty string", () => {
      const leftEditor = createMockEditor("left");
      const rightEditor = createMockEditor("right");
      mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
      mockFindCounterpartCode.mockReturnValue(null);
      mockGetCodeBlockIndex.mockReturnValue(0);
      mockFindCodeBlockByIndex
        .mockReturnValueOnce({ pos: 10, size: 5 })
        .mockReturnValueOnce({ pos: 20, size: 5 });

      const { result } = renderHook(() =>
        useBlockMergeCompare({
          editor: rightEditor,
          getPos: () => 0,
          language: "mermaid",
          code: "old code",
          editOpen: true,
        }),
      );

      act(() => {
        result.current.handleMergeApply("", "");
      });

      // Should use tr.delete instead of replaceWith
      expect(rightEditor._tr.delete).toHaveBeenCalled();
      expect(leftEditor._tr.delete).toHaveBeenCalled();
    });

    it("skips block update when findCodeBlockByIndex returns null", () => {
      const leftEditor = createMockEditor("left");
      const rightEditor = createMockEditor("right");
      mockGetMergeEditors.mockReturnValue({ leftEditor, rightEditor });
      mockFindCounterpartCode.mockReturnValue(null);
      mockGetCodeBlockIndex.mockReturnValue(0);
      mockFindCodeBlockByIndex
        .mockReturnValueOnce(null) // thisBlock = null
        .mockReturnValueOnce(null); // compareBlock = null

      const { result } = renderHook(() =>
        useBlockMergeCompare({
          editor: rightEditor,
          getPos: () => 0,
          language: "mermaid",
          code: "old code",
          editOpen: true,
        }),
      );

      act(() => {
        result.current.handleMergeApply("new code", "new compare");
      });

      // chain().command() should still be called but the block update inside should be skipped
      // Since findCodeBlockByIndex returns null, the chain should not be called
      // Actually looking at the code, chain is not called when block is null
      expect(rightEditor._tr.replaceWith).not.toHaveBeenCalled();
      expect(leftEditor._tr.replaceWith).not.toHaveBeenCalled();
    });
  });
});
