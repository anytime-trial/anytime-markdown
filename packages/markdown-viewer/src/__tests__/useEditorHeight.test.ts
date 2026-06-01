/**
 * useEditorHeight のユニットテスト
 *
 * ウィンドウサイズに基づくエディタ高さの計算を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useEditorHeight } from "../hooks/useEditorHeight";
import {
  EDITOR_HEIGHT_DEFAULT,
  EDITOR_HEIGHT_MD,
  EDITOR_HEIGHT_MIN,
  EDITOR_HEIGHT_MOBILE,
} from "../constants/dimensions";

// ResizeObserver モック
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe("useEditorHeight", () => {
  it("デスクトップの初期高さは EDITOR_HEIGHT_DEFAULT", () => {
    const { result } = renderHook(() => useEditorHeight(false, false));
    expect(result.current.editorHeight).toBe(EDITOR_HEIGHT_DEFAULT);
  });

  it("md サイズの初期高さは EDITOR_HEIGHT_MD", () => {
    const { result } = renderHook(() => useEditorHeight(false, true));
    expect(result.current.editorHeight).toBe(EDITOR_HEIGHT_MD);
  });

  it("モバイルの初期高さは EDITOR_HEIGHT_MOBILE", () => {
    const { result } = renderHook(() => useEditorHeight(true, false));
    expect(result.current.editorHeight).toBe(EDITOR_HEIGHT_MOBILE);
  });

  it("editorContainerRef が返される", () => {
    const { result } = renderHook(() => useEditorHeight(false, false));
    expect(result.current.editorContainerRef).toBeDefined();
  });

  it("resize イベントで高さが更新される", () => {
    const { result } = renderHook(() => useEditorHeight(false, false));

    // ref に DOM 要素を設定
    const mockDiv = document.createElement("div");
    Object.defineProperty(mockDiv, "getBoundingClientRect", {
      value: () => ({ top: 100, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    });
    Object.defineProperty(result.current.editorContainerRef, "current", {
      value: mockDiv,
      writable: true,
    });

    // window.innerHeight を設定
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    // Math.floor(800 - 100 - 0) = 700、EDITOR_HEIGHT_MIN 以上
    expect(result.current.editorHeight).toBeGreaterThanOrEqual(EDITOR_HEIGHT_MIN);
    expect(result.current.editorHeight).toBe(700);
  });

  it("bottomOffset が考慮される", () => {
    const { result } = renderHook(() => useEditorHeight(false, false, 50));

    const mockDiv = document.createElement("div");
    Object.defineProperty(mockDiv, "getBoundingClientRect", {
      value: () => ({ top: 100, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    });
    Object.defineProperty(result.current.editorContainerRef, "current", {
      value: mockDiv,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    // Math.floor(800 - 100 - 50) = 650
    expect(result.current.editorHeight).toBe(650);
  });

  it("高さが EDITOR_HEIGHT_MIN を下回らない", () => {
    const { result } = renderHook(() => useEditorHeight(false, false));

    const mockDiv = document.createElement("div");
    Object.defineProperty(mockDiv, "getBoundingClientRect", {
      value: () => ({ top: 900, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    });
    Object.defineProperty(result.current.editorContainerRef, "current", {
      value: mockDiv,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.editorHeight).toBe(EDITOR_HEIGHT_MIN);
  });
});
