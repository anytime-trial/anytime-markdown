import { useId, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Dialog.module.css";
import { useModalFocusTrap } from "./useModalFocusTrap";

/** MUI breakpoint 名 → max-width(px)。MUI Dialog の maxWidthXs..Xl と同値。 */
const MAX_WIDTH_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 444,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  "aria-label"?: string;
  labelledBy?: string;
  /** 最大幅。false で上限なし。既定 "sm"（MUI 既定と同値）。 */
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
  /** maxWidth まで横いっぱいに広げる。 */
  fullWidth?: boolean;
  /** 全画面表示（余白・角丸なし）。 */
  fullScreen?: boolean;
  /** paper への追加クラス。 */
  paperClassName?: string;
  /** paper への追加スタイル（背景色上書き等）。 */
  paperStyle?: CSSProperties;
}

/**
 * MUI Dialog の置換。Portal + backdrop + ESC + フォーカストラップ + aria-modal。
 * maxWidth / fullWidth / fullScreen / paperStyle で MUI の主要レイアウト prop を再現。
 */
export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
  maxWidth = "sm",
  fullWidth,
  fullScreen,
  paperClassName,
  paperStyle,
  ...rest
}: Readonly<DialogProps>) {
  const paperRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useModalFocusTrap(open, paperRef, onClose);

  if (!open || typeof document === "undefined") return null;

  const computedPaperStyle: CSSProperties = {
    ...(fullScreen || maxWidth === false
      ? {}
      : { maxWidth: `min(${MAX_WIDTH_PX[maxWidth]}px, calc(100vw - 64px))` }),
    ...paperStyle,
  };

  const paperClass = [
    styles.paper,
    fullWidth && !fullScreen && styles.fullWidth,
    fullScreen && styles.fullScreen,
    paperClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={paperRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={rest["aria-label"]}
        className={paperClass}
        style={computedPaperStyle}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogTitle({ children, id }: Readonly<{ children: ReactNode; id?: string }>) {
  return <h2 id={id} className={styles.title}>{children}</h2>;
}

export function DialogContent({
  children,
  dividers,
}: Readonly<{ children: ReactNode; dividers?: boolean }>) {
  const className = [styles.content, dividers && styles.contentDividers].filter(Boolean).join(" ");
  return <div className={className}>{children}</div>;
}

export function DialogActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.actions}>{children}</div>;
}

/** title を id 連携するための補助フック。 */
export function useDialogTitleId(): string {
  return useId();
}
