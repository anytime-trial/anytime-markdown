import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  "aria-label"?: string;
  labelledBy?: string;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** MUI Dialog の置換（PoC）。Portal + backdrop + ESC + 最小フォーカストラップ + aria-modal。 */
export function Dialog({ open, onClose, children, labelledBy, ...rest }: Readonly<DialogProps>) {
  const paperRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const first = paperRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => restoreRef.current?.focus?.();
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
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

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
