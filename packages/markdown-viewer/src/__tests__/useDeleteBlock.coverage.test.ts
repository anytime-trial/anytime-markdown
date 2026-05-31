/**
 * useDeleteBlock.ts のカバレッジテスト
 */
import { renderHook, act } from "@testing-library/react";
import { useDeleteBlock } from "../hooks/useDeleteBlock";

describe("useDeleteBlock coverage", () => {
  it("returns a function", () => {
    const editor = null;
    const getPos = jest.fn(() => 0);
    const { result } = renderHook(() => useDeleteBlock(editor as any, getPos, 10));
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when editor is null", () => {
    const { result } = renderHook(() => useDeleteBlock(null as any, jest.fn(), 10));
    act(() => { result.current(); });
  });

  it("does nothing when getPos is not a function", () => {
    const editor = { chain: jest.fn() } as any;
    const { result } = renderHook(() => useDeleteBlock(editor, "invalid" as any, 10));
    act(() => { result.current(); });
    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("does nothing when getPos returns null", () => {
    const editor = { chain: jest.fn() } as any;
    const getPos = jest.fn(() => null);
    const { result } = renderHook(() => useDeleteBlock(editor, getPos as any, 10));
    act(() => { result.current(); });
    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("calls editor delete when valid", () => {
    const run = jest.fn();
    const command = jest.fn().mockReturnValue({ run });
    const focus = jest.fn().mockReturnValue({ command });
    const chain = jest.fn().mockReturnValue({ focus });
    const editor = { chain } as any;
    const getPos = jest.fn(() => 5);
    const { result } = renderHook(() => useDeleteBlock(editor, getPos as any, 10));
    act(() => { result.current(); });
    expect(chain).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });
});
