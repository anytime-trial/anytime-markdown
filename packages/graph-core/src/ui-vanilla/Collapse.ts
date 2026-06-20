/**
 * 脱React の vanilla DOM Collapse ファクトリ（MUI Collapse / ui/Collapse.tsx 置換）。
 *
 * 既存 React 実装 `ui/Collapse.tsx`（+ `Collapse.module.css`）の見た目・API を素 DOM で再現する。
 * `grid-template-rows` 0fr→1fr の遷移で JS による高さ計測なしに auto 高さをアニメーションし、
 * `unmountOnExit` のときは収縮完了後に子をアンマウントする。
 *
 * 開閉ライフサイクル（mounted / visible）は `./transitionMount` の `createTransitionMount` に委譲し、
 * React hook（useTransitionMount 等）には依存しない。テーマ依存値（`--am-ease-standard`）は
 * CSS 変数で追従する（React / useIsDark 非依存）。content 流し込みは `./dom` の共通ヘルパーを使う。
 */

import { appendContent, type VanillaContent } from "./dom";
import { createTransitionMount } from "./transitionMount";

/** {@link createCollapse} のオプション。React `CollapseProps` のうち vanilla で再現する範囲。 */
export interface CreateCollapseOptions {
  /** 初期展開状態。既定 false。 */
  in?: boolean;
  /** 遷移時間(ms)。既定 150。 */
  timeout?: number;
  /** 閉じた後に子をアンマウント（DOM から取り外す）する。既定 false。 */
  unmountOnExit?: boolean;
  /** 展開領域内の中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** root への追加クラス。 */
  className?: string;
}

const ROOT_BASE_CSS =
  "display:grid;grid-template-rows:0fr;" +
  "transition:grid-template-rows var(--collapse-duration,150ms) var(--am-ease-standard, ease);";

// grid アイテムは min-height:0 + overflow:hidden で 0fr 時に潰れる（Collapse.module.css .inner 相当）。
const INNER_CSS = "overflow:hidden;min-height:0;";

/**
 * vanilla Collapse を生成する（MUI Collapse 置換）。
 *
 * - `root`（display:grid）> `inner`（overflow:hidden）> children の 2 層構造。
 * - `setOpen(true)` で grid-template-rows 0fr→1fr（root に open 用 inline style）、`setOpen(false)` で 1fr→0fr。
 * - `unmountOnExit` のとき、生成時 in=false なら inner は DOM に未追加。収縮完了（timeout 後）で取り外す。
 *
 * 返り値の `el`（root）を親へ append すると配置できる。`destroy()` で進行中タイマー（rAF / setTimeout）を解除する。
 */
export function createCollapse(opts: CreateCollapseOptions = {}): {
  el: HTMLDivElement;
  inner: HTMLDivElement;
  setOpen: (open: boolean) => void;
  update: (next: Partial<CreateCollapseOptions>) => void;
  destroy: () => void;
} {
  const timeout = opts.timeout ?? 150;
  const unmountOnExit = opts.unmountOnExit ?? false;
  const initialOpen = opts.in ?? false;

  const el = document.createElement("div");
  el.setAttribute("data-am-collapse", "");
  el.style.cssText = ROOT_BASE_CSS;
  el.style.setProperty("--collapse-duration", `${timeout}ms`);
  if (opts.className) el.className = opts.className;

  const inner = document.createElement("div");
  inner.setAttribute("data-am-collapse-inner", "");
  inner.style.cssText = INNER_CSS;
  appendContent(inner, opts.children);

  // visible（展開）状態を root の grid-template-rows へ反映。
  const applyVisible = (visible: boolean): void => {
    el.style.gridTemplateRows = visible ? "1fr" : "0fr";
    el.setAttribute("data-open", visible ? "true" : "false");
  };

  // mounted（DOM 存在）状態を inner の append/remove へ反映（unmountOnExit のときのみ remove）。
  const applyMounted = (mounted: boolean): void => {
    if (mounted) {
      if (inner.parentNode !== el) el.appendChild(inner);
    } else {
      inner.remove();
    }
  };

  const transition = createTransitionMount({
    open: initialOpen,
    timeout,
    unmountOnExit,
    onMountedChange: applyMounted,
    onVisibleChange: applyVisible,
  });

  // 初期状態の反映（createTransitionMount は初期値で callback を発火しないため明示適用）。
  applyVisible(initialOpen);
  if (!unmountOnExit || initialOpen) el.appendChild(inner);

  return {
    el,
    inner,
    setOpen(open: boolean) {
      transition.setOpen(open);
    },
    update(next: Partial<CreateCollapseOptions>) {
      if (next.className !== undefined) el.className = next.className;
      if (next.timeout !== undefined) {
        el.style.setProperty("--collapse-duration", `${next.timeout}ms`);
      }
      if (next.children !== undefined) {
        for (const node of [...inner.childNodes]) inner.removeChild(node);
        appendContent(inner, next.children);
      }
      if (next.in !== undefined) transition.setOpen(next.in);
    },
    destroy() {
      transition.dispose();
    },
  };
}
