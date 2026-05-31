/**
 * useBlockCapture.ts のテスト
 * useBlockCapture フック、saveBlob 再エクスポートをテスト
 */
import { renderHook } from "@testing-library/react";
import { useBlockCapture, saveBlob } from "../hooks/useBlockCapture";
import type { NodeViewProps } from "@tiptap/react";

// clipboardHelpers のモック
jest.mock("../utils/clipboardHelpers", () => ({
  saveBlob: jest.fn(),
}));

describe("useBlockCapture", () => {
  const mockGetPos = jest.fn(() => 0) as unknown as NodeViewProps["getPos"];

  it("returns a function", () => {
    const mockEditor = {
      view: {
        nodeDOM: jest.fn(() => null),
      },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    expect(typeof result.current).toBe("function");
  });

  it("returns a stable function reference", () => {
    const mockEditor = {
      view: {
        nodeDOM: jest.fn(() => null),
      },
    } as unknown as NodeViewProps["editor"];

    const { result, rerender } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("does nothing when editor is null", async () => {
    const { result } = renderHook(() =>
      useBlockCapture(null as unknown as NodeViewProps["editor"], mockGetPos),
    );
    // Should not throw
    await result.current();
  });

  it("does nothing when getPos is not a function", async () => {
    const mockEditor = {
      view: { nodeDOM: jest.fn() },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() =>
      useBlockCapture(mockEditor, "not-a-function" as unknown as NodeViewProps["getPos"]),
    );
    await result.current();
    expect(mockEditor.view.nodeDOM).not.toHaveBeenCalled();
  });

  it("does nothing when nodeDOM returns null", async () => {
    const mockEditor = {
      view: { nodeDOM: jest.fn(() => null) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    await result.current();
    // no error
  });

  it("accepts custom fileName", () => {
    const mockEditor = {
      view: { nodeDOM: jest.fn(() => null) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() =>
      useBlockCapture(mockEditor, mockGetPos, "custom.png"),
    );
    expect(typeof result.current).toBe("function");
  });
});

describe("saveBlob re-export", () => {
  it("is exported from useBlockCapture", () => {
    expect(saveBlob).toBeDefined();
    expect(typeof saveBlob).toBe("function");
  });
});
