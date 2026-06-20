import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { injectTrailUiStyles } from "./injectStyles";

export interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

export interface MenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** 絶対座標基準（右クリックメニュー）。 */
  readonly anchorReference?: "anchorPosition" | "anchorEl";
  readonly anchorPosition?: MenuPosition;
  /** MUI 互換: anchorEl が指定された場合、その下に表示する。 */
  readonly anchorEl?: HTMLElement | null;
}

/**
 * MUI Menu の置換（anchorPosition 絶対座標基準 / anchorEl 要素基準）。
 * backdrop クリック / Escape で閉じる。`document.body` へポータルする。
 */
export function Menu({
  open,
  onClose,
  children,
  anchorPosition,
  anchorEl,
}: Readonly<MenuProps>) {
  injectTrailUiStyles();
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) paperRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  // Derive position from anchorEl if no explicit anchorPosition
  let pos: MenuPosition | null = anchorPosition ?? null;
  if (!pos && anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    pos = { top: rect.bottom, left: rect.left };
  }
  if (!pos) return null;

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <>
      <div className="trv-menu-backdrop" onMouseDown={onClose} />
      <div
        ref={paperRef}
        className="trv-menu-paper"
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ top: pos.top, left: pos.left }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
