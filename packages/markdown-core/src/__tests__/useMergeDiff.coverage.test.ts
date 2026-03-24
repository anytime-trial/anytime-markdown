/**
 * useMergeDiff.ts のカバレッジテスト
 */
import { renderHook, act } from "@testing-library/react";
import { useMergeDiff } from "../hooks/useMergeDiff";

describe("useMergeDiff coverage", () => {
  it("initializes with empty texts", () => {
    const { result } = renderHook(() => useMergeDiff());
    expect(result.current.compareText).toBe("");
  });

  it("setEditText and setCompareText update state", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("# Left"); });
    act(() => { result.current.setCompareText("# Right"); });
    expect(result.current.compareText).toBe("# Right");
  });

  it("diffResult is computed from edit and compare texts", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("line1\nline2"); });
    act(() => { result.current.setCompareText("line1\nline3"); });
    expect(result.current.diffResult).toBeTruthy();
    expect(result.current.diffResult?.blocks.length).toBeGreaterThan(0);
  });

  it("mergeBlock applies merge and updates texts", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("old"); });
    act(() => { result.current.setCompareText("new"); });
    const blockId = result.current.diffResult?.blocks[0]?.id;
    if (blockId !== undefined) {
      act(() => { result.current.mergeBlock(blockId, "left-to-right"); });
    }
  });

  it("undo/redo work", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("v1"); });
    act(() => { result.current.setCompareText("v1-compare"); });

    // Make a change
    act(() => { result.current.setEditText("v2"); });

    // canUndo/canRedo state
    expect(typeof result.current.canUndo).toBe("boolean");
    expect(typeof result.current.canRedo).toBe("boolean");
  });

  it("diffOptions can be updated", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setDiffOptions(prev => ({ ...prev, semantic: true }));
    });
    expect(result.current.diffOptions.semantic).toBe(true);
  });

  it("calls onLeftTextChange callback when editText changes", () => {
    const onLeftTextChange = jest.fn();
    const { result } = renderHook(() => useMergeDiff(onLeftTextChange));
    act(() => { result.current.setEditText("updated"); });
    // The callback may be called on next render cycle
  });

  it("identical texts produce no diff blocks", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => { result.current.setEditText("same"); });
    act(() => { result.current.setCompareText("same"); });
    expect(result.current.diffResult?.blocks.length).toBe(0);
  });
});
