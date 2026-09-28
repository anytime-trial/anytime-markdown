export type BusyState = "idle" | "loading" | "error";

/** 非同期処理の状態を機械可読属性と支援技術へ同時に伝える。 */
export function setBusyState(el: Element, state: BusyState): void {
  el.setAttribute("data-state", state);
  if (state === "loading") {
    el.setAttribute("aria-busy", "true");
  } else {
    el.removeAttribute("aria-busy");
  }
}

export function clearBusyState(el: Element): void {
  el.removeAttribute("data-state");
  el.removeAttribute("aria-busy");
}
