/**
 * 脱React の vanilla DOM Backdrop ファクトリ（MUI Backdrop / ui/Backdrop.tsx 置換）。
 *
 * 全画面固定オーバーレイ + フェードを素 DOM で再現する。テーマ色は `--am-color-*` CSS 変数
 * （`applyEditorThemeCssVars` 注入）で追従し、React テーマ API（useIsDark 等）に依存しない。
 * content 流し込み / style 適用は `./dom` の共通ヘルパーを使う。
 *
 * Dialog（createDialog / 構成パーツ）は `./Dialog` が所有する（本ファイルは backdrop のみ）。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** {@link createBackdrop} のオプション。MUI Backdrop（ui/Backdrop.tsx）置換。 */
export interface CreateBackdropOptions {
  /** 初期表示状態。既定 false（生成直後はフェードイン対象）。 */
  open?: boolean;
  /** フェード時間(ms)。既定 225。 */
  timeout?: number;
  /** root への追加クラス。 */
  className?: string;
  /** root への追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** オーバーレイ内の中身。 */
  children?: VanillaContent;
  /** オーバーレイ（背景）クリック時のコールバック。target===currentTarget のときのみ発火。 */
  onClick?: () => void;
}

/**
 * 全画面固定オーバーレイ + フェード（MUI Backdrop 置換）。
 *
 * - `position:fixed; inset:0` の半透明黒オーバーレイ。z-index / レイアウトは消費側 className で上書き。
 * - `setOpen(true)` で opacity 0→1、`setOpen(false)` で 1→0（CSS transition）。
 * - `onClick` は背景（自身）クリック時のみ発火（中身クリックは無視）。
 * - `destroy()` で listener を解除し、親から el を取り外す。
 */
export function createBackdrop(opts: CreateBackdropOptions = {}): {
  el: HTMLDivElement;
  setOpen: (open: boolean) => void;
  update: (next: Partial<CreateBackdropOptions>) => void;
  destroy: () => void;
} {
  const timeout = opts.timeout ?? 225;
  const el = document.createElement("div");
  el.setAttribute("data-am-backdrop", "");
  // ui/Backdrop.module.css .root 相当を cssText に展開。--backdrop-duration は timeout 連動。
  el.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
    "background-color:rgba(0,0,0,0.5);color:#fff;opacity:0;" +
    "transition:opacity var(--backdrop-duration," +
    `${timeout}ms) var(--am-ease-standard, ease);` +
    "-webkit-tap-highlight-color:transparent;";
  el.style.setProperty("--backdrop-duration", `${timeout}ms`);
  if (opts.className) el.className = opts.className;
  applyStyle(el, opts.style);
  appendContent(el, opts.children);

  let clickHandler: ((e: MouseEvent) => void) | null = null;
  const attachClick = (cb: (() => void) | undefined): void => {
    if (clickHandler) {
      el.removeEventListener("mousedown", clickHandler);
      clickHandler = null;
    }
    if (!cb) return;
    clickHandler = (e: MouseEvent) => {
      if (e.target === e.currentTarget) cb();
    };
    el.addEventListener("mousedown", clickHandler);
  };
  attachClick(opts.onClick);

  const setOpen = (open: boolean): void => {
    el.style.opacity = open ? "1" : "0";
  };
  setOpen(opts.open ?? false);

  return {
    el,
    setOpen,
    update(next) {
      if (next.className !== undefined) el.className = next.className;
      if (next.style !== undefined) applyStyle(el, next.style);
      if (next.timeout !== undefined) {
        el.style.setProperty("--backdrop-duration", `${next.timeout}ms`);
      }
      if (next.onClick !== undefined) attachClick(next.onClick);
      if (next.open !== undefined) setOpen(next.open);
    },
    destroy() {
      if (clickHandler) {
        el.removeEventListener("mousedown", clickHandler);
        clickHandler = null;
      }
      el.remove();
    },
  };
}
