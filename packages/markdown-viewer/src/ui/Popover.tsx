import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Placement } from "@floating-ui/dom";

import styles from "./Popover.module.css";
import { useFloating } from "./useFloating";
import { FOCUSABLE } from "./useModalFocusTrap";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  /** 既定 bottom-start（MUI の anchorOrigin bottom-left / transformOrigin top-left 相当）。 */
  placement?: Placement;
  /** paper（floating コンテナ）に付与する role。MUI の slotProps.paper.role 相当。 */
  paperRole?: string;
  "aria-label"?: string;
  /** paper への追加スタイル。 */
  paperStyle?: CSSProperties;
  children: ReactNode;
}

/**
 * MUI Popover の置換。anchorEl にアンカーした floating paper（useFloating）+ Portal +
 * 透明 backdrop（click-away）+ Escape で閉じる。
 *
 * メニュー内のキーボード item ナビゲーション（↑↓ で項目移動）は持たない（MUI Popover も
 * 同様で、それが要るものは ui/Menu）。open 時は paper 内の最初の focusable（無ければ
 * paper 自体）へフォーカスし、閉じたら元へ戻す。
 */
export function Popover({
  open,
  onClose,
  anchorEl,
  placement = "bottom-start",
  paperRole,
  "aria-label": ariaLabel,
  paperStyle,
  children,
}: Readonly<PopoverProps>) {
  const { referenceRef, floatingRef, floatingStyle } = useFloating({ open, placement, offsetPx: 4 });
  const restoreRef = useRef<HTMLElement | null>(null);

  // useFloating の open エフェクトより前に reference を確定させるため render 中に代入する。
  referenceRef.current = anchorEl;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => {
      const paper = floatingRef.current;
      const first = paper?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? paper)?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      restoreRef.current?.focus?.();
    };
  }, [open, floatingRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={styles.backdrop} onMouseDown={onClose} />
      <div
        ref={(node) => { floatingRef.current = node; }}
        role={paperRole}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={styles.paper}
        style={{ ...floatingStyle, ...paperStyle }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
