/**
 * 脱React の vanilla DOM フォーカストラップ（ui/useModalFocusTrap.ts 置換）。
 *
 * モーダルオーバーレイ（Dialog / Drawer 等）のフォーカス管理を React hook ではなく、要素を
 * 引数で受けて attach / detach する素関数として実装する。`createDialog` 等が内部に持っていた
 * 「初期フォーカス / 背景スクロールロック / 背景 a11y 隠蔽 / Tab 循環トラップ / ESC / 復帰」の
 * 共通ロジックを 1 箇所へ集約する（重複実装を避ける）。React テーマ API / useIsDark には依存しない。
 *
 * - attach 時に直前のフォーカス要素を退避し、container 内の最初の focusable（無ければ container
 *   自体）へフォーカスを移す。
 * - 背景スクロールを `document.body.style.overflow = "hidden"` でロックし、release で元へ戻す。
 * - 背景（container の body 直下祖先以外の body 直下要素）に `aria-hidden="true"` を付け、
 *   release で元へ戻す（MUI Modal 同挙動。支援技術から背景を隠す）。container が body 配下に
 *   未挿入のときは portalRoot を解決できないため隠蔽は行わない。
 * - container の keydown を購読し、ESC で `onClose`、Tab / Shift+Tab で container 内の循環トラップ。
 *
 * focusable 列挙には共有の {@link FOCUSABLE} セレクタを使う（dom.ts と同一・再実装禁止）。
 */

import { FOCUSABLE } from "./dom";

/** {@link createFocusTrap} のオプション。 */
export interface CreateFocusTrapOptions {
  /** フォーカストラップの対象コンテナ（paper / drawer panel 等）。 */
  container: HTMLElement;
  /** ESC キー押下時のコールバック。未指定なら ESC は無視する。 */
  onClose?: () => void;
  /** 背景スクロールロックを行うか（既定 true）。 */
  lockScroll?: boolean;
  /** 背景 a11y 隠蔽（body 直下要素への aria-hidden 付与）を行うか（既定 true）。 */
  hideBackground?: boolean;
}

/**
 * フォーカストラップを生成し、即座に attach する。
 *
 * @returns `release`（listener 解除・背景 a11y / overflow 復元・直前フォーカス復帰）。
 *   冪等（複数回呼んでも二重復元しない）。
 */
export function createFocusTrap(opts: CreateFocusTrapOptions): {
  release: () => void;
} {
  const { container, onClose, lockScroll = true, hideBackground = true } = opts;

  // 直前のフォーカス要素を退避（release で復帰する）。
  const restore = document.activeElement as HTMLElement | null;

  // container 内の最初の focusable（無ければ container 自体・tabIndex=-1）へフォーカスを移す。
  const first = container.querySelector<HTMLElement>(FOCUSABLE);
  (first ?? container).focus();

  // 背景スクロールロック。
  let prevOverflow: string | null = null;
  if (lockScroll) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  // 背景を a11y ツリーから隠す。container の body 直下祖先（Portal ルート）を特定し、それ以外の
  // body 直下要素に aria-hidden を付ける。既に true のものは触らない（release でも触らない）。
  const hidden: Element[] = [];
  if (hideBackground) {
    const portalRoot = container.closest("body > *");
    if (portalRoot) {
      for (const el of document.body.children) {
        if (el !== portalRoot && el.getAttribute("aria-hidden") !== "true") {
          el.setAttribute("aria-hidden", "true");
          hidden.push(el);
        }
      }
    }
  }

  // ESC + Tab フォーカストラップ（ui/useModalFocusTrap の onKeyDown 相当）。
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      if (onClose) {
        e.stopPropagation();
        onClose();
      }
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes.length === 0) return;
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === firstNode) {
      e.preventDefault();
      lastNode.focus();
    } else if (!e.shiftKey && document.activeElement === lastNode) {
      e.preventDefault();
      firstNode.focus();
    }
  };
  container.addEventListener("keydown", onKeyDown);

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      container.removeEventListener("keydown", onKeyDown);
      if (prevOverflow !== null) document.body.style.overflow = prevOverflow;
      for (const el of hidden) el.removeAttribute("aria-hidden");
      restore?.focus?.();
    },
  };
}
