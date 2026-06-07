import { useEffect, useMemo } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Placement } from "@floating-ui/dom";

import { useFloating } from "./useFloating";
import styles from "./Menu.module.css";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  /** anchorReference="anchorEl"（既定）時のアンカー要素。 */
  anchorEl?: HTMLElement | null;
  anchorReference?: "anchorEl" | "anchorPosition";
  /** anchorReference="anchorPosition" 時の固定座標（viewport 基準）。 */
  anchorPosition?: { top: number; left: number };
  placement?: Placement;
  minWidth?: number;
  /** paper（floating コンテナ）への追加スタイル。MUI の slotProps.paper.sx 相当。 */
  paperStyle?: CSSProperties;
  "aria-label"?: string;
  children: ReactNode;
}

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/** MUI Menu の置換。useFloating で配置、Portal + backdrop で click-away、矢印キー nav / ESC 対応。 */
export function Menu({
  open,
  onClose,
  anchorEl,
  anchorReference = "anchorEl",
  anchorPosition,
  placement = "bottom-start",
  minWidth,
  paperStyle,
  "aria-label": ariaLabel,
  children,
}: Readonly<MenuProps>) {
  const { referenceRef, floatingRef, x, y, ready } = useFloating({ open, placement, offsetPx: 2 });

  // anchorPosition 用の仮想アンカー（座標が変わらなければ安定）。
  const virtual = useMemo(() => {
    if (anchorReference !== "anchorPosition" || !anchorPosition) return null;
    const { top, left } = anchorPosition;
    const rect = {
      x: left, y: top, top, left, right: left, bottom: top, width: 0, height: 0,
      toJSON: () => ({}),
    };
    return { getBoundingClientRect: () => rect as DOMRect };
  }, [anchorReference, anchorPosition?.top, anchorPosition?.left]);

  // useFloating の open エフェクトより前に reference を確定させるため render 中に代入する。
  referenceRef.current = (anchorReference === "anchorPosition" ? virtual : anchorEl ?? null) as HTMLElement | null;

  // open 時に最初の項目へフォーカス。
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const first = floatingRef.current?.querySelector(MENU_ITEM_SELECTOR) as HTMLElement | null;
      first?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, floatingRef]);

  const handleKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const el = floatingRef.current;
    if (!el) return;
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
      return;
    }
    const items = Array.from(el.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(current + 1 + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items.at(-1)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <ul
        ref={(node) => { floatingRef.current = node; }}
        role="menu"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={styles.paper}
        style={{
          left: x,
          top: y,
          minWidth,
          // 位置確定前は opacity で不可視化（visibility:hidden は a11y ツリーから外れ
          // getByRole が拾えなくなるため）。
          opacity: ready ? 1 : 0,
          pointerEvents: ready ? undefined : "none",
          ...paperStyle,
        }}
        onKeyDown={handleKeyDown}
      >
        {children}
      </ul>
    </>,
    document.body,
  );
}
