import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { injectGraphUiStyles } from './injectStyles';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** MUI Dialog の置換。backdrop クリック / Escape で閉じる。 */
export function Dialog({ open, onClose, children }: Readonly<DialogProps>) {
  injectGraphUiStyles();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="gv-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="gv-dialog-paper" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="gv-dialog-title">{children}</div>;
}

export function DialogContent({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: CSSProperties }>) {
  return (
    <div className="gv-dialog-content" style={style}>
      {children}
    </div>
  );
}

export function DialogContentText({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="gv-dialog-content-text">{children}</p>;
}

export function DialogActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="gv-dialog-actions">{children}</div>;
}
