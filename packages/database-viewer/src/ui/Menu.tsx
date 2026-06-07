import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

export interface MenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** 絶対座標基準（右クリックメニュー）。 */
  readonly anchorReference?: "anchorPosition";
  readonly anchorPosition?: MenuPosition;
}

/**
 * MUI Menu の置換（anchorPosition 絶対座標基準）。
 * backdrop クリック / Escape で閉じる。`document.body` へポータルする。
 */
export function Menu({ open, onClose, children, anchorPosition }: Readonly<MenuProps>) {
  injectDatabaseUiStyles();
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) paperRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  if (!anchorPosition) return null;

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <>
      <div className="dbv-menu-backdrop" onMouseDown={onClose} />
      <div
        ref={paperRef}
        className="dbv-menu-paper"
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ top: anchorPosition.top, left: anchorPosition.left }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
