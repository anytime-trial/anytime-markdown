import { useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Dialog.module.css";
import { useModalFocusTrap } from "./useModalFocusTrap";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  "aria-label"?: string;
  labelledBy?: string;
}

/** MUI Dialog の置換（PoC）。Portal + backdrop + ESC + 最小フォーカストラップ + aria-modal。 */
export function Dialog({ open, onClose, children, labelledBy, ...rest }: Readonly<DialogProps>) {
  const paperRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useModalFocusTrap(open, paperRef, onClose);

  if (!open || typeof document === "undefined") return null;

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
        className={styles.paper}
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

export function DialogContent({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.content}>{children}</div>;
}

export function DialogActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.actions}>{children}</div>;
}

/** title を id 連携するための補助フック。 */
export function useDialogTitleId(): string {
  return useId();
}
