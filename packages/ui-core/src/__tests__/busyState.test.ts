/** @jest-environment jsdom */
import { clearBusyState, setBusyState, type BusyState } from "../busyState";

describe("busyState", () => {
  test("idle・loading・error 間の遷移で data-state と aria-busy を同期する", () => {
    const el = document.createElement("section");
    const states: BusyState[] = ["idle", "loading", "error", "loading", "idle"];
    for (const state of states) {
      setBusyState(el, state);
      expect(el.getAttribute("data-state")).toBe(state);
      expect(el.getAttribute("aria-busy")).toBe(state === "loading" ? "true" : null);
    }
  });

  test.each<BusyState>(["idle", "loading", "error"])("clearBusyState は %s の状態属性だけを除去し冪等", (state) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("aria-label", "結果");
    setBusyState(el, state);
    clearBusyState(el);
    expect(el.hasAttribute("data-state")).toBe(false);
    expect(el.hasAttribute("aria-busy")).toBe(false);
    expect(el.getAttribute("aria-label")).toBe("結果");
    clearBusyState(el);
    expect(el.hasAttribute("data-state")).toBe(false);
    expect(el.hasAttribute("aria-busy")).toBe(false);
  });
});
