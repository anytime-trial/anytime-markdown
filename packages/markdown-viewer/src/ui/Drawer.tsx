import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** スライドして現れる方向。 */
  anchor?: "left" | "right";
  /** paper の幅（px 数値 or CSS 長さ）。MUI の slotProps.paper.sx.width 相当。 */
  width?: number | string;
  /** paper への追加スタイル。MUI の slotProps.paper.sx 相当。 */
  paperStyle?: CSSProperties;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  children: ReactNode;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * MUI の temporary Drawer 置換。Portal + backdrop + ESC + slide transition +
 * 最小フォーカストラップ + 背景スクロールロック。
 *
 * `aria-labelledby` は presentation ルートに付与する（MUI と同じ挙動）。VR は
 * `[aria-labelledby="..."]` でルートを locate しスクショするため、ここを動かすと
 * スクショ領域が変わって基準が壊れる。paper 自体は role="dialog" / aria-modal。
 */
export function Drawer({
  open,
  onClose,
  anchor = "left",
  width,
  paperStyle,
  "aria-labelledby": labelledBy,
  "aria-label": ariaLabel,
  children,
}: Readonly<DrawerProps>) {
  const paperRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    restoreRef.current = document.activeElement as HTMLElement | null;
    const paper = paperRef.current;
    // フォーカス可能要素がなければ paper 自体（tabIndex=-1）へ退避する。
    const first = paper?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? paper)?.focus();
    // 背景スクロールをロックし、閉じたら元の overflow へ戻す。
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 次フレームで entered を立て、slide / fade のトランジションを発火させる。
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = paperRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === firstNode) {
      e.preventDefault();
      lastNode.focus();
    } else if (!e.shiftKey && document.activeElement === lastNode) {
      e.preventDefault();
      firstNode.focus();
    }
  }, [onClose]);

  if (!open || typeof document === "undefined") return null;

  const anchorClass = anchor === "right" ? styles.right : styles.left;
  const enteredClass = entered ? ` ${styles.entered}` : "";

  return createPortal(
    <div
      className={styles.root}
      role="presentation"
      aria-labelledby={labelledBy}
      data-print-hide=""
    >
      <div
        className={`${styles.backdrop}${enteredClass}`}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      />
      <div
        ref={paperRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`${styles.paper} ${anchorClass}${enteredClass}`}
        style={{ width, ...paperStyle }}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
