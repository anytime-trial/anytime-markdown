import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface DialogProps {
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly children?: ReactNode;
  readonly maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
  readonly fullWidth?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  /** Escape キーで閉じる（既定 true）。 */
  readonly disableEscapeKeyDown?: boolean;
  readonly sx?: Record<string, unknown>;
}

const MAX_WIDTH_MAP: Record<string, string> = {
  xs: "444px",
  sm: "600px",
  md: "900px",
  lg: "1200px",
  xl: "1536px",
};

/** MUI Dialog の置換。document.body にポータル、backdrop クリック / Escape で閉じる。 */
export function Dialog({
  open,
  onClose,
  children,
  maxWidth = "sm",
  fullWidth,
  style,
  className,
  disableEscapeKeyDown,
  sx,
}: Readonly<DialogProps>) {
  injectTrailUiStyles();
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) paperRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape" && !disableEscapeKeyDown) {
      e.stopPropagation();
      onClose?.();
    }
  };

  const handleBackdropClick = (): void => {
    onClose?.();
  };

  const maxWidthPx = maxWidth !== false ? MAX_WIDTH_MAP[maxWidth] : undefined;
  const paperStyle: CSSProperties = {
    ...sxToStyle(sx),
    ...(maxWidthPx ? { maxWidth: maxWidthPx } : {}),
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };

  return createPortal(
    <div
      className="trv-dialog-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        ref={paperRef}
        className={["trv-dialog-paper", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={paperStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
