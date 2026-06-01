/**
 * useFloatingToolbar のユニットテスト
 *
 * エディタ内のノード選択に基づくフローティングツールバーの位置計算を検証する。
 */

import { renderHook } from "@testing-library/react";
import { useFloatingToolbar } from "../hooks/useFloatingToolbar";

function createMockEditor(nodeType: string, language?: string) {
  const listeners: Record<string, (() => void)[]> = {};
  const mockDom = document.createElement("div");
  Object.defineProperty(mockDom, "getBoundingClientRect", {
    value: () => ({ top: 200, left: 100, right: 500, bottom: 250, width: 400, height: 50 }),
  });

  return {
    state: {
      selection: {
        $from: {
          depth: 2,
          node: (depth: number) => {
            if (depth === 1) return { type: { name: nodeType }, attrs: { language } };
            return { type: { name: "paragraph" }, attrs: {} };
          },
          before: () => 10,
        },
      },
    },
    view: {
      nodeDOM: () => mockDom,
    },
    on: jest.fn((event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    off: jest.fn(),
    _emit: (event: string) => { listeners[event]?.forEach(cb => cb()); },
  };
}

describe("useFloatingToolbar", () => {
  it("対象ノードが選択されているとき position を返す", () => {
    const editor = createMockEditor("codeBlock");
    const wrapperRef = { current: document.createElement("div") };
    Object.defineProperty(wrapperRef.current, "getBoundingClientRect", {
      value: () => ({ top: 100, left: 50, right: 550, bottom: 800, width: 500, height: 700 }),
    });

    const { result } = renderHook(() =>
      useFloatingToolbar(editor as never, wrapperRef, "codeBlock"),
    );

    // top: 200 - 100 - 36 = 64, left: 500 - 50 = 450
    expect(result.current).toEqual({ top: 64, left: 450 });
  });

  it("対象ノードが選択されていないとき null を返す", () => {
    const editor = createMockEditor("table"); // table を選択中
    const wrapperRef = { current: document.createElement("div") };

    const { result } = renderHook(() =>
      useFloatingToolbar(editor as never, wrapperRef, "codeBlock"), // codeBlock を探す
    );

    expect(result.current).toBeNull();
  });

  it("language を指定してフィルタリングできる", () => {
    const editor = createMockEditor("codeBlock", "mermaid");
    const wrapperRef = { current: document.createElement("div") };
    Object.defineProperty(wrapperRef.current, "getBoundingClientRect", {
      value: () => ({ top: 0, left: 0, right: 500, bottom: 500, width: 500, height: 500 }),
    });

    const { result } = renderHook(() =>
      useFloatingToolbar(editor as never, wrapperRef, "codeBlock", "mermaid"),
    );

    expect(result.current).not.toBeNull();
  });

  it("language が一致しないとき null を返す", () => {
    const editor = createMockEditor("codeBlock", "javascript");
    const wrapperRef = { current: document.createElement("div") };

    const { result } = renderHook(() =>
      useFloatingToolbar(editor as never, wrapperRef, "codeBlock", "mermaid"),
    );

    expect(result.current).toBeNull();
  });

  it("editor が null のとき null を返す", () => {
    const wrapperRef = { current: document.createElement("div") };

    const { result } = renderHook(() =>
      useFloatingToolbar(null, wrapperRef, "codeBlock"),
    );

    expect(result.current).toBeNull();
  });

  it("wrapperRef が null のとき null を返す", () => {
    const editor = createMockEditor("codeBlock");
    const wrapperRef = { current: null };

    const { result } = renderHook(() =>
      useFloatingToolbar(editor as never, wrapperRef, "codeBlock"),
    );

    expect(result.current).toBeNull();
  });

  it("selectionUpdate イベントで position が更新される", () => {
    const editor = createMockEditor("codeBlock");
    const wrapperRef = { current: document.createElement("div") };
    Object.defineProperty(wrapperRef.current, "getBoundingClientRect", {
      value: () => ({ top: 0, left: 0, right: 500, bottom: 500, width: 500, height: 500 }),
    });

    renderHook(() => useFloatingToolbar(editor as never, wrapperRef, "codeBlock"));

    expect(editor.on).toHaveBeenCalledWith("selectionUpdate", expect.any(Function));
    expect(editor.on).toHaveBeenCalledWith("update", expect.any(Function));
  });

  it("アンマウント時にリスナーが解除される", () => {
    const editor = createMockEditor("codeBlock");
    const wrapperRef = { current: document.createElement("div") };

    const { unmount } = renderHook(() =>
      useFloatingToolbar(editor as never, wrapperRef, "codeBlock"),
    );

    unmount();

    expect(editor.off).toHaveBeenCalledWith("selectionUpdate", expect.any(Function));
    expect(editor.off).toHaveBeenCalledWith("update", expect.any(Function));
  });
});
