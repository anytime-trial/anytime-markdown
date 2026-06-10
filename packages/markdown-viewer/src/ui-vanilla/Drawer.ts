/**
 * 脱React の vanilla DOM Drawer ファクトリ（MUI temporary Drawer / ui/Drawer.tsx 置換）。
 *
 * Portal 相当（呼び元で append）+ backdrop + ESC + slide transition（left/right）+
 * フォーカストラップ + 背景スクロールロックを素 DOM で実装する。React hook
 * （useModalFocusTrap / useState / useEffect）には依存せず、`createFocusTrap` を再利用する。
 * テーマ色は `--am-color-*` / `--am-*` CSS 変数（applyEditorThemeCssVars 注入）で追従する。
 *
 * - open ごとに closed 位置（translateX(-100%) / (100%)）から slide させるため、生成直後に
 *   1 フレーム（requestAnimationFrame）挟んで entered（translateX(0) + backdrop opacity 1）を立てる。
 * - `aria-labelledby` は presentation ルート（root）に付与する（MUI / React 実装と同じ挙動）。
 *   paper 自体は role="dialog" / aria-modal="true"。
 * - backdrop 自身の mousedown で `onClose`（paper 内クリックは無視）。
 * - ESC / Tab フォーカストラップ・背景スクロールロック・直前フォーカス復帰は `createFocusTrap` に委譲する。
 *
 * 生成時に `portalTarget`（既定 `document.body`）へ自前マウントして開く（呼び元は append 不要）。
 * 返り値の `el` は参照用。`destroy()` で listener 解除・rAF 解除・scroll lock 解除
 * （focusTrap.release 経由）・直前フォーカス復帰・el の取り外しを行う。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";
import { createFocusTrap } from "./focusTrap";

/** スライドして現れる方向（MUI Drawer anchor 相当）。 */
export type DrawerAnchor = "left" | "right";

/** {@link createDrawer} のオプション。React `DrawerProps` のうち vanilla で再現する範囲。 */
export interface CreateDrawerOptions {
  /** 閉じる要求（背景クリック / ESC）時のコールバック。 */
  onClose: () => void;
  /** スライドして現れる方向（既定 "left"）。 */
  anchor?: DrawerAnchor;
  /** paper の幅（px 数値 or CSS 長さ）。MUI の slotProps.paper.sx.width 相当。 */
  width?: number | string;
  /** paper への追加スタイル（MUI の slotProps.paper.sx 相当）。 */
  paperStyle?: Partial<CSSStyleDeclaration>;
  /** paper（role=dialog）内に入れる中身。 */
  children?: VanillaContent;
  /** マウント先（ポータル）。既定 document.body。Menu/Dialog/Popover/Select と統一した self-append。 */
  portalTarget?: HTMLElement;
  /** aria-labelledby に渡す title 要素の id（presentation ルートに付与）。 */
  labelledBy?: string;
  /** aria-label（paper に付与）。 */
  ariaLabel?: string;
}

/** presentation ルート（.root 相当）。z-index 1300 の固定オーバーレイ。 */
const ROOT_CSS = "position:fixed;inset:0;z-index:1300;";

/** backdrop（.backdrop 相当）。entered 前は opacity 0 で、entered で opacity 1 へ遷移。 */
const BACKDROP_CSS =
  "position:fixed;inset:0;background:rgba(0,0,0,0.5);opacity:0;" +
  "transition:opacity var(--am-duration-fast) var(--am-ease-standard);";

/**
 * paper（.paper 相当）。MUI 同様ダークモードでは elevation overlay で持ち上げる
 * （--am-overlay-elevation-16、light では none）。box-shadow は MUI shadows[16] と一致。
 */
const PAPER_BASE_CSS =
  "position:fixed;top:0;bottom:0;display:flex;flex-direction:column;" +
  "max-width:100%;overflow-y:auto;outline:none;box-sizing:border-box;" +
  "background-color:var(--am-color-bg-paper);" +
  "background-image:var(--am-overlay-elevation-16, none);" +
  "color:var(--am-color-text-primary);box-shadow:var(--am-elevation-3);" +
  "transition:transform var(--am-duration-fast) var(--am-ease-standard);";

/** anchor 別の固定辺 + closed 位置の transform（.left / .right 相当）。 */
const ANCHOR_CSS: Record<DrawerAnchor, string> = {
  left: "left:0;transform:translateX(-100%);",
  right: "right:0;transform:translateX(100%);",
};

/** width（数値は px、文字列はそのまま）を CSS 値へ変換する。undefined は空文字。 */
function widthCss(width: number | string | undefined): string {
  if (width === undefined) return "";
  return typeof width === "number" ? `width:${width}px;` : `width:${width};`;
}

/**
 * vanilla Drawer を生成する。
 *
 * @returns `el`（presentation ルート）/ `paper`（role=dialog）/ `destroy`（全クリーンアップ）。
 */
export function createDrawer(opts: CreateDrawerOptions): {
  el: HTMLDivElement;
  paper: HTMLDivElement;
  destroy: () => void;
} {
  const { onClose } = opts;
  const anchor: DrawerAnchor = opts.anchor ?? "left";

  // presentation ルート（aria-labelledby はここに付与）。
  const el = document.createElement("div");
  el.setAttribute("role", "presentation");
  el.setAttribute("data-print-hide", "");
  el.style.cssText = ROOT_CSS;
  if (opts.labelledBy) el.setAttribute("aria-labelledby", opts.labelledBy);

  // backdrop（entered 前 opacity 0）。
  const backdrop = document.createElement("div");
  backdrop.setAttribute("data-am-drawer-backdrop", "");
  backdrop.style.cssText = BACKDROP_CSS;

  // paper（role=dialog）。closed 位置（translateX ±100%）から開始。
  const paper = document.createElement("div");
  paper.setAttribute("role", "dialog");
  paper.setAttribute("aria-modal", "true");
  paper.setAttribute("data-anchor", anchor);
  paper.tabIndex = -1;
  if (opts.ariaLabel) paper.setAttribute("aria-label", opts.ariaLabel);
  paper.style.cssText = PAPER_BASE_CSS + ANCHOR_CSS[anchor] + widthCss(opts.width);
  applyStyle(paper, opts.paperStyle);
  appendContent(paper, opts.children);

  el.appendChild(backdrop);
  el.appendChild(paper);

  // 背景（backdrop 自身）の mousedown で閉じる（paper 内クリックは無視）。
  const onBackdropMouseDown = (e: MouseEvent): void => {
    if (e.target === e.currentTarget) onClose();
  };
  backdrop.addEventListener("mousedown", onBackdropMouseDown);

  // ポータルとして自前マウントする（Menu/Dialog/Popover/Select と統一）。focusTrap の初期フォーカスは
  // 接続後に行う必要がある（detached focus は no-op）。
  (opts.portalTarget ?? document.body).appendChild(el);

  // ESC / Tab フォーカストラップ + 初期フォーカス + 背景スクロールロック + 直前フォーカス復帰。
  const focusTrap = createFocusTrap({ container: paper, onClose });

  // closed 位置から slide させるため、1 フレーム挟んで entered を立てる
  // （mount と同一フレームでの遷移開始＝アニメーション抜けを回避）。
  let rafId: number | null = requestAnimationFrame(() => {
    rafId = null;
    backdrop.style.opacity = "1";
    paper.style.transform = "translateX(0)";
  });

  let destroyed = false;
  return {
    el,
    paper,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      backdrop.removeEventListener("mousedown", onBackdropMouseDown);
      // focusTrap.release が keydown 解除・scroll lock 復元・直前フォーカス復帰を行う。
      focusTrap.release();
      el.remove();
    },
  };
}
