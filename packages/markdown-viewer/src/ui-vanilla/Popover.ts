/**
 * 脱React の vanilla DOM Popover ファクトリ（MUI Popover / ui/Popover.tsx 置換）。
 *
 * 既存 React 実装 `ui/Popover.tsx`（+ `Popover.module.css`）の見た目・API・a11y を素 DOM で
 * 再現する。anchor にアンカーした floating paper + 透明 backdrop（click-away）+ Escape で閉じる +
 * 初期フォーカス / 復帰フォーカスを提供する。
 *
 * このファイルは前フェーズ生成済みの低レイヤを **再利用** して組み立てる（再実装禁止）:
 *   - `./floating` の {@link createFloating} ... reference→floating の配置計算 + autoUpdate 購読。
 *   - `./focusTrap` の {@link createFocusTrap} ... 初期フォーカス / Tab 循環トラップ / ESC / 復帰。
 *   - `./dom` の共有 helper（appendContent / applyStyle）... content 流し込み / style 適用。
 *
 * Popover はモーダルではないため、focusTrap の背景スクロールロック / 背景 a11y 隠蔽は無効化する
 * （MUI Popover も背景を操作しない）。Escape での閉じ + 直前フォーカスへの復帰（restoration）は
 * focusTrap の onClose / release（restore）に委譲する。
 *
 * メニュー内のキーボード item ナビ（↑↓）は持たない（MUI Popover 同様。要るものは createMenu）。
 * テーマ色は `--am-color-*` / `--am-*` CSS 変数で追従し、React テーマ API（useIsDark 等）には
 * 依存しない。
 */

import type { ReferenceElement } from "@floating-ui/dom";

import { appendContent, applyStyle, type VanillaContent } from "./dom";
import { createFloating } from "./floating";
import type { Placement } from "./floating";
import { createFocusTrap } from "./focusTrap";

export type { Placement } from "./floating";

/** click-away 用の透明 backdrop（floating.module.css .backdrop 相当）。z-index 1300。 */
const BACKDROP_CSS = "position:fixed;inset:0;z-index:1300;";

/** 浮遊する elevated paper（floating.module.css .floatingPaper 相当）。位置は createFloating が付与。 */
const FLOATING_PAPER_CSS =
  "z-index:1300;outline:none;box-sizing:border-box;" +
  "background-color:var(--am-color-bg-paper);border-radius:var(--am-radius-md);" +
  "box-shadow:var(--am-elevation-3);";

/** {@link createPopover} のオプション。MUI Popover（ui/Popover.tsx）置換。 */
export interface CreatePopoverOptions {
  /** アンカー要素。実 DOM か virtual element（`{ getBoundingClientRect }`）。 */
  anchor: ReferenceElement;
  /** 閉じる要求（背景クリック / ESC）時のコールバック。 */
  onClose: () => void;
  /** paper（floating コンテナ）内に入れる中身。 */
  children?: VanillaContent;
  /** 既定 bottom-start（MUI anchorOrigin bottom-left / transformOrigin top-left 相当）。 */
  placement?: Placement;
  /** paper に付与する role（MUI slotProps.paper.role 相当）。 */
  paperRole?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** paper への追加スタイル。 */
  paperStyle?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Popover の置換（素 DOM）。anchor にアンカーした floating paper（createFloating）+
 * 透明 backdrop（click-away）+ Escape で閉じる + 初期 / 復帰フォーカス（createFocusTrap）。
 *
 * 返り値の `el`（backdrop + paper を内包する wrapper・createPortal フラグメント相当）を
 * `document.body` 等へ append すると開く。`destroy()` で listener 解除・autoUpdate 解除・
 * focusTrap release（直前フォーカス復帰）・el の取り外しを行う。
 *
 * append 後（focusTrap attach 時）に paper 内の最初の focusable（無ければ paper 自体）へ
 * フォーカスし、`destroy()` で元の要素へ戻す。
 */
export function createPopover(opts: CreatePopoverOptions): {
  el: HTMLDivElement;
  paper: HTMLDivElement;
  destroy: () => void;
} {
  const { anchor, onClose, placement = "bottom-start" } = opts;

  // backdrop + paper を 1 つの wrapper に内包（createPortal フラグメント相当）。
  const el = document.createElement("div");
  el.setAttribute("data-am-popover-root", "");

  const backdrop = document.createElement("div");
  backdrop.setAttribute("data-am-popover-backdrop", "");
  backdrop.style.cssText = BACKDROP_CSS;

  const paper = document.createElement("div");
  paper.setAttribute("data-am-popover-paper", "");
  if (opts.paperRole) paper.setAttribute("role", opts.paperRole);
  if (opts.ariaLabel) paper.setAttribute("aria-label", opts.ariaLabel);
  paper.tabIndex = -1;
  paper.style.cssText = FLOATING_PAPER_CSS;
  applyStyle(paper, opts.paperStyle);
  appendContent(paper, opts.children);

  el.appendChild(backdrop);
  el.appendChild(paper);

  // 背景クリックで閉じる（Popover.tsx backdrop onMouseDown 相当）。
  const onBackdropMouseDown = (): void => onClose();
  backdrop.addEventListener("mousedown", onBackdropMouseDown);

  // floating 配置（offsetPx 4 = Popover.tsx useFloating）。
  const floating = createFloating({
    reference: anchor,
    floating: paper,
    placement,
    offsetPx: 4,
  });

  // 初期フォーカス / Tab 循環トラップ / ESC で閉じる / 直前フォーカス復帰を focusTrap に委譲する。
  // Popover はモーダルではないため背景スクロールロック・背景 a11y 隠蔽は行わない（MUI Popover 同様）。
  const focusTrap = createFocusTrap({
    container: paper,
    onClose,
    lockScroll: false,
    hideBackground: false,
  });

  let destroyed = false;
  return {
    el,
    paper,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      floating.destroy();
      backdrop.removeEventListener("mousedown", onBackdropMouseDown);
      // focusTrap.release は listener 解除 + 直前フォーカス復帰（focus restoration）を行う。
      focusTrap.release();
      el.remove();
    },
  };
}
