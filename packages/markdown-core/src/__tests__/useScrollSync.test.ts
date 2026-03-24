/**
 * useScrollSync のユニットテスト
 *
 * DOM 要素のモックを使い、左右パネルのスクロール同期を検証する。
 */

import { renderHook } from "@testing-library/react";
import { useScrollSync } from "../hooks/useScrollSync";

function createScrollableElement(overrides: Partial<HTMLDivElement> = {}): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: overrides.scrollHeight ?? 1000, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: overrides.clientHeight ?? 500, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: 0, writable: true, configurable: true });
  return el;
}

describe("useScrollSync", () => {
  let originalRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    // requestAnimationFrame を同期的に実行
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  it("左パネルのスクロールが右パネルに同期される", () => {
    const leftEl = createScrollableElement({ scrollHeight: 1000, clientHeight: 500 });
    const rightEl = createScrollableElement({ scrollHeight: 2000, clientHeight: 500 });

    // 左パネル内にスクロール可能な子を配置
    const scrollableChild = createScrollableElement({ scrollHeight: 1000, clientHeight: 500 });
    // getComputedStyle でスクロール可能と判定されるよう設定
    Object.defineProperty(scrollableChild.style, "overflowY", { value: "auto", configurable: true });

    const leftRef = { current: leftEl };
    const rightRef = { current: rightEl };

    renderHook(() => useScrollSync(leftRef, rightRef));

    // 左パネル内のスクロールイベントをシミュレート
    const scrollEvent = new Event("scroll", { bubbles: true });
    Object.defineProperty(scrollEvent, "target", { value: leftEl });
    Object.defineProperty(leftEl, "scrollTop", { value: 250, configurable: true }); // 50% スクロール

    leftEl.dispatchEvent(scrollEvent);

    // 右パネルのスクロール位置が同期される（50% = 750）
    expect(rightEl.scrollTop).toBe(750);
  });

  it("右パネルのスクロールが左パネルに同期される", () => {
    const leftEl = createScrollableElement({ scrollHeight: 1000, clientHeight: 500 });
    const rightEl = createScrollableElement({ scrollHeight: 2000, clientHeight: 500 });

    // findScrollableChild が見つけられるよう、scrollable な子要素を追加
    const scrollableChild = document.createElement("div");
    Object.defineProperty(scrollableChild, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(scrollableChild, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scrollableChild, "scrollTop", { value: 0, writable: true, configurable: true });
    scrollableChild.style.overflowY = "auto";
    leftEl.appendChild(scrollableChild);

    const leftRef = { current: leftEl };
    const rightRef = { current: rightEl };

    renderHook(() => useScrollSync(leftRef, rightRef));

    // 右パネルを 50% スクロール
    Object.defineProperty(rightEl, "scrollTop", { value: 750, configurable: true });
    rightEl.dispatchEvent(new Event("scroll"));

    // 左の子要素が同期される（50% = 200）
    expect(scrollableChild.scrollTop).toBe(200);
  });

  it("ref が null の場合はエラーにならない", () => {
    const leftRef = { current: null };
    const rightRef = { current: null };

    // エラーが出なければ OK
    renderHook(() => useScrollSync(leftRef, rightRef));
  });

  it("クリーンアップでイベントリスナーが解除される", () => {
    const leftEl = createScrollableElement();
    const rightEl = createScrollableElement();

    const leftSpy = jest.spyOn(leftEl, "removeEventListener");
    const rightSpy = jest.spyOn(rightEl, "removeEventListener");

    const leftRef = { current: leftEl };
    const rightRef = { current: rightEl };

    const { unmount } = renderHook(() => useScrollSync(leftRef, rightRef));

    unmount();

    expect(leftSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(rightSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
