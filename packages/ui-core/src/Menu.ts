/**
 * 脱React の vanilla DOM Menu ファクトリ（MUI Menu / ui/Menu.tsx 置換）。
 *
 * 既存 React 実装 `ui/Menu.tsx`（+ `Menu.module.css`）の見た目・API・a11y を素 DOM で再現する。
 * Portal 相当（呼び元で append）+ 透明 backdrop（click-away / 右クリック閉じ）+ anchor へアンカー
 * した floating ul(role=menu) + 矢印キー nav（↑↓ / Home / End）+ Enter/Space で項目 click +
 * ESC/Tab で閉じる + 初期フォーカス（最初の menuitem）+ 直前フォーカス復帰を提供する。
 *
 * このファイルは前フェーズ生成済みの低レイヤを **再利用** して組み立てる（再実装禁止）:
 *   - `./floating` の {@link createFloating} ... reference→floating の配置計算 + autoUpdate 購読。
 *   - `./floating` の {@link createVirtualAnchor} ... anchorPosition（固定座標）→ virtual reference。
 *   - `./focusTrap` の {@link createFocusTrap} ... 直前フォーカス退避 / 復帰（Popover と同様）。
 *   - `./MenuList` の {@link createMenuList} ... ↑↓ / Home / End / Enter / Esc の state machine。
 *   - `./dom` の共有 helper（appendContent / applyStyle）... content 流し込み / style 適用。
 *
 * Menu はモーダルではない（MUI Menu 同様、背景クリックで閉じるが scroll/aria-hidden は操作しない）
 * ため focusTrap の lockScroll / hideBackground は無効化する。MenuList のキーボードナビは roving
 * tabindex ではなく DOM フォーカスで表現する（React Menu に揃える）ため、onActiveChange で
 * アクティブ項目へ `focus()` し、onSelect で `click()` し、onCancel / Tab で `onClose` を呼ぶ。
 *
 * `anchorEl`（実 DOM）と `anchorPosition`（virtual rect）の双方を受ける（MUI anchorReference 相当）。
 * テーマ色は `--am-color-*` / `--am-*` CSS 変数で追従し、React テーマ API（useIsDark 等）には
 * 依存しない。`Popover.ts` の組み立てパターン（createFloating + createFocusTrap）に揃える。
 */

import type { ReferenceElement } from "@floating-ui/dom";

import { appendContent, applyStyle, TRANSPARENT_BACKDROP_CSS, type VanillaContent } from "./dom";
import { createFloating, createVirtualAnchor } from "./floating";
import type { Placement } from "./floating";
import { createFocusTrap } from "./focusTrap";
import { createMenuList } from "./MenuList";

export type { Placement } from "./floating";


/**
 * ul(role=menu) 専用 paper cssText（Menu.module.css .paper = floatingPaper + 寸法）。
 * 位置（left/top）は createFloating が付与する。padding 等は MenuList の BASE_CSS が
 * 別途付与するため、ここでは floating paper の見た目（背景 / 角丸 / 影）と寸法のみ持つ。
 */
const MENU_PAPER_CSS =
  "z-index:1300;outline:none;box-sizing:border-box;" +
  "background-color:var(--am-color-bg-paper);border-radius:var(--am-radius-md);" +
  "box-shadow:var(--am-elevation-3);" +
  "min-width:112px;max-height:calc(100vh - 32px);overflow:auto;";


/** {@link createMenu} のオプション。MUI Menu（ui/Menu.tsx）置換。 */
export interface CreateMenuOptions {
  /** 閉じる要求（背景クリック / 右クリック / ESC / Tab）時のコールバック。 */
  onClose: () => void;
  /**
   * アンカー参照方式（MUI anchorReference 相当）。既定 "anchorEl"。
   * "anchorEl" は {@link CreateMenuOptions.anchorEl}、"anchorPosition" は
   * {@link CreateMenuOptions.anchorPosition} を使う。
   */
  anchorReference?: "anchorEl" | "anchorPosition";
  /** anchorReference="anchorEl"（既定）時のアンカー要素。 */
  anchorEl?: HTMLElement | null;
  /** anchorReference="anchorPosition" 時の固定座標（viewport 基準）。 */
  anchorPosition?: { top: number; left: number };
  /** menu（ul）内に入れる項目（role=menuitem を持つ要素群）。 */
  children?: VanillaContent;
  /** 既定 bottom-start（MUI anchorOrigin bottom-left / transformOrigin top-left 相当）。 */
  placement?: Placement;
  /** 最小幅(px)。 */
  minWidth?: number;
  /** ul（floating コンテナ）への追加スタイル（MUI slotProps.paper.sx 相当）。 */
  paperStyle?: Partial<CSSStyleDeclaration>;
  /** aria-label。 */
  ariaLabel?: string;
}

/**
 * 指定の anchorReference / anchorEl / anchorPosition から floating 用の reference を解決する。
 * anchorPosition は virtual rect（{@link createVirtualAnchor}）に変換する。解決不能（anchorEl が
 * null 等）の場合でも computePosition がクラッシュしないよう、原点(0,0)の virtual rect を返す。
 */
function resolveReference(
  reference: "anchorEl" | "anchorPosition",
  anchorEl: HTMLElement | null | undefined,
  anchorPosition: { top: number; left: number } | undefined,
): ReferenceElement {
  if (reference === "anchorPosition") {
    return createVirtualAnchor(anchorPosition ?? { top: 0, left: 0 });
  }
  return anchorEl ?? createVirtualAnchor({ top: 0, left: 0 });
}

/**
 * MUI Menu の置換（素 DOM）。透明 backdrop（click-away / 右クリック閉じ）+ anchor へアンカーした
 * floating ul(role=menu)（createFloating）+ MenuList の矢印キー state machine（↑↓ / Home / End /
 * Enter / Esc）+ Tab で閉じる + 初期フォーカス（最初の menuitem）/ 直前フォーカス復帰（createFocusTrap）。
 *
 * 返り値の `el`（backdrop + ul を内包する wrapper・createPortal フラグメント相当）を `document.body`
 * 等へ append すると開く。`destroy()` で listener 解除・autoUpdate 解除・MenuList 破棄・focusTrap
 * release（直前フォーカス復帰）・el の取り外しを行う。
 *
 * - backdrop の click / contextmenu で `onClose`（Menu.tsx backdrop onClick / onContextMenu 相当）。
 * - menu(ul) の keydown: ↑↓ / Home / End で項目移動（MenuList・DOM フォーカスで表現）、Enter/Space で
 *   アクティブ項目 click、ESC / Tab で `onClose`。
 * - append 後（focusTrap attach + 初期 active）に最初の menuitem へフォーカスする。
 */
export function createMenu(opts: CreateMenuOptions): {
  el: HTMLDivElement;
  menu: HTMLUListElement;
  destroy: () => void;
} {
  const { onClose, anchorReference = "anchorEl", placement = "bottom-start" } = opts;

  // backdrop + ul を 1 つの wrapper に内包（createPortal フラグメント相当）。
  const el = document.createElement("div");
  el.setAttribute("data-am-menu-root", "");

  const backdrop = document.createElement("div");
  backdrop.setAttribute("data-am-menu-backdrop", "");
  backdrop.style.cssText = TRANSPARENT_BACKDROP_CSS;

  // MenuList を再利用して ul(role=menu) + キーボード state machine を構築する。
  // 矢印キーで動いたアクティブ項目を DOM フォーカスへ反映（React Menu 同様 focus ベース）、
  // Enter ではアクティブ項目を click、Esc では onClose を呼ぶ。
  const list = createMenuList({
    ariaLabel: opts.ariaLabel,
    onActiveChange: (_index, item) => {
      item?.focus?.();
    },
    onSelect: (_index, item) => {
      item.click();
    },
    onCancel: onClose,
  });
  const menu = list.el;
  // floating paper の見た目・寸法を付与（MenuList の padding 等は cssText 末尾に維持する）。
  menu.style.cssText += MENU_PAPER_CSS;
  if (opts.minWidth !== undefined) menu.style.minWidth = `${opts.minWidth}px`;
  applyStyle(menu, opts.paperStyle);
  appendContent(menu, opts.children);

  el.appendChild(backdrop);
  el.appendChild(menu);

  // ポータルとして document.body へ自前マウントする（backdrop + position:fixed のオーバーレイ）。
  // 接続前に focus すると no-op になる（detached focus はブラウザ/jsdom 共に効かない）ため、
  // 初期フォーカス（後段の setActiveIndex / focusTrap）より前に必ず接続しておく。destroy で取り外す。
  document.body.appendChild(el);

  // 背景クリック / 右クリックで閉じる（Menu.tsx backdrop onClick / onContextMenu 相当）。
  const onBackdropClick = (): void => onClose();
  const onBackdropContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    onClose();
  };
  backdrop.addEventListener("click", onBackdropClick);
  backdrop.addEventListener("contextmenu", onBackdropContextMenu);

  // Tab で閉じる（Menu.tsx handleKeyDown の Tab 分岐相当）。Space は Enter と同じく click。
  // ↑↓ / Home / End / Enter / Esc は MenuList（list.el）の state machine が処理する。
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Tab") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === " ") {
      // MenuList は Space を扱わないため、ここで Enter 相当（アクティブ項目 click）にする。
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };
  menu.addEventListener("keydown", onKeyDown);

  // floating 配置（offsetPx 2 = Menu.tsx useFloating）。anchorEl / anchorPosition の双方に対応。
  const reference = resolveReference(anchorReference, opts.anchorEl, opts.anchorPosition);
  const floating = createFloating({
    reference,
    floating: menu,
    placement,
    offsetPx: 2,
  });

  // 直前フォーカス退避 / 復帰を focusTrap に委譲する（Menu はモーダルでないため scroll/aria 隠蔽は無効）。
  // ESC は MenuList の onCancel で閉じるため focusTrap の onClose は渡さない（二重発火回避）。
  // setActiveIndex より前に作り、restore 対象が「open 前の activeElement」になるようにする。
  const focusTrap = createFocusTrap({
    container: menu,
    lockScroll: false,
    hideBackground: false,
  });

  // open 時に最初の menuitem を active にし、onActiveChange 経由で DOM フォーカスを移す。
  // el は既に document へ接続済みのため focus が有効（detached focus は no-op）。focusTrap の
  // restore 捕捉後に行うことで、focusTrap が active 項目ではなく open 前要素を復帰対象にする。
  // 最初の「有効な」menuitem の index へ active を移す（setActiveIndex は disabled をスキップ
   // しないため、ここで enabled の index を求める）。DOM スキャンは 1 回に抑える。
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"]')];
  const idx = items.findIndex((it) => it.getAttribute("aria-disabled") !== "true");
  if (idx >= 0) list.setActiveIndex(idx);

  let destroyed = false;
  return {
    el,
    menu,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      floating.destroy();
      backdrop.removeEventListener("click", onBackdropClick);
      backdrop.removeEventListener("contextmenu", onBackdropContextMenu);
      menu.removeEventListener("keydown", onKeyDown);
      // MenuList の keydown / pointerover listener を解除。
      list.destroy();
      // focusTrap.release は listener 解除 + 直前フォーカス復帰（focus restoration）を行う。
      focusTrap.release();
      el.remove();
    },
  };
}
