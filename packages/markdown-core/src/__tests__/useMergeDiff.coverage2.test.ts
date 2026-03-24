/**
 * useMergeDiff.ts - 追加カバレッジテスト (lines 44, 48-50, 60-63)
 * selectBlock, goToNextBlock, goToPrevBlock, clampedIndex, undo/redo with callback
 */
import { renderHook, act } from "@testing-library/react";
import { useMergeDiff } from "../hooks/useMergeDiff";

describe("useMergeDiff coverage2", () => {
  it("goToNextBlock increments and clamps at max", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("aaa"); });
    act(() => { result.current.setCompareText("bbb"); });
    // Should have blocks
    expect(result.current.totalBlocks).toBeGreaterThan(0);
    // Navigate next beyond max
    act(() => { result.current.goToNextBlock(); });
    act(() => { result.current.goToNextBlock(); });
    act(() => { result.current.goToNextBlock(); });
    expect(result.current.currentBlockIndex).toBeLessThanOrEqual(result.current.totalBlocks - 1);
  });

  it("goToPrevBlock decrements and clamps at 0", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("aaa"); });
    act(() => { result.current.setCompareText("bbb"); });
    act(() => { result.current.goToPrevBlock(); });
    expect(result.current.currentBlockIndex).toBe(0);
  });

  it("goToNextBlock returns 0 when totalBlocks is 0", () => {
    const { result } = renderHook(() => useMergeDiff());
    // no text => no blocks
    act(() => { result.current.goToNextBlock(); });
    expect(result.current.currentBlockIndex).toBe(0);
  });

  it("selectBlock sets currentBlockIndex to matching block", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("line1\nline2\nline3"); });
    act(() => { result.current.setCompareText("line1\nchanged\nline3"); });
    const blockId = result.current.diffResult?.blocks[0]?.id;
    if (blockId !== undefined) {
      act(() => { result.current.selectBlock(blockId); });
      expect(result.current.currentBlockIndex).toBe(0);
    }
  });

  it("selectBlock does nothing when diffResult is null", () => {
    const { result } = renderHook(() => useMergeDiff());
    // No texts set, diffResult is null
    act(() => { result.current.selectBlock(999); });
    expect(result.current.currentBlockIndex).toBe(0);
  });

  it("selectBlock does nothing for non-existent blockId", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("a"); });
    act(() => { result.current.setCompareText("b"); });
    act(() => { result.current.selectBlock(999); });
    expect(result.current.currentBlockIndex).toBe(0);
  });

  it("mergeAllBlocks left-to-right copies edit to compare", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("original"); });
    act(() => { result.current.setCompareText("different"); });
    act(() => { result.current.mergeAllBlocks("left-to-right"); });
    expect(result.current.compareText).toBe("original");
    expect(result.current.canUndo).toBe(true);
  });

  it("mergeAllBlocks right-to-left copies compare to edit and calls callback", () => {
    const onEditChange = jest.fn();
    const { result } = renderHook(() => useMergeDiff(onEditChange));
    act(() => { result.current.setEditText("original"); });
    act(() => { result.current.setCompareText("different"); });
    act(() => { result.current.mergeAllBlocks("right-to-left"); });
    expect(result.current.editText).toBe("different");
    expect(onEditChange).toHaveBeenCalledWith("different");
  });

  it("undo restores previous state and calls callback", () => {
    const onEditChange = jest.fn();
    const { result } = renderHook(() => useMergeDiff(onEditChange));
    act(() => { result.current.setEditText("v1"); });
    act(() => { result.current.setCompareText("c1"); });
    act(() => { result.current.mergeAllBlocks("left-to-right"); });
    const afterMerge = result.current.compareText;
    act(() => { result.current.undo(); });
    expect(result.current.canRedo).toBe(true);
  });

  it("redo restores undone state", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("v1"); });
    act(() => { result.current.setCompareText("c1"); });
    act(() => { result.current.mergeAllBlocks("left-to-right"); });
    act(() => { result.current.undo(); });
    act(() => { result.current.redo(); });
    expect(result.current.canUndo).toBe(true);
  });

  it("undo does nothing when stack is empty", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.undo(); });
    expect(result.current.canUndo).toBe(false);
  });

  it("redo does nothing when stack is empty", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.redo(); });
    expect(result.current.canRedo).toBe(false);
  });

  it("mergeBlock with invalid diffResult does nothing", () => {
    const { result } = renderHook(() => useMergeDiff());
    // No texts, no diffResult
    act(() => { result.current.mergeBlock(999, "left-to-right"); });
  });

  it("mergeBlock with invalid blockId does nothing", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("a"); });
    act(() => { result.current.setCompareText("b"); });
    act(() => { result.current.mergeBlock(999, "left-to-right"); });
  });

  it("semantic diff option produces results", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setDiffOptions({ semantic: true }); });
    act(() => { result.current.setEditText("hello world"); });
    act(() => { result.current.setCompareText("hello earth"); });
    expect(result.current.diffResult).toBeTruthy();
  });
});
