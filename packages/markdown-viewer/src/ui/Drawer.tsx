import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Drawer.module.css";
import { useModalFocusTrap } from "./useModalFocusTrap";

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
  const onKeyDown = useModalFocusTrap(open, paperRef, onClose);
  // open ごとに closed 位置から slide させるため、フレームを 1 つ挟んで entered を立てる。
  // consumer は Drawer を常時マウントするので、閉じたら次回のために entered をリセットする。
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const anchorClass = anchor === "right" ? styles.right : styles.left;
  const paperClassName = [styles.paper, anchorClass, entered && styles.entered]
    .filter(Boolean)
    .join(" ");
  const backdropClassName = [styles.backdrop, entered && styles.entered]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={styles.root}
      role="presentation"
      aria-labelledby={labelledBy}
      data-print-hide=""
    >
      <div
        className={backdropClassName}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      />
      <div
        ref={paperRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={paperClassName}
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
