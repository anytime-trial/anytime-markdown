"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  labelId: string;
  children: ReactNode;
}

/** 最小限のモーダル（backdrop クリック / Escape で閉じる・初期フォーカス移動）。 */
export function ModalShell({ open, onClose, labelId, children }: Readonly<ModalShellProps>) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }
  return (
    <div
      className="tk-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="tk-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
