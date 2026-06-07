import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Snackbar.module.css";

export interface SnackbarAnchorOrigin {
  vertical: "top" | "bottom";
  horizontal: "left" | "center" | "right";
}

export interface SnackbarProps {
  open: boolean;
  /** 自動非表示までの ms。null で無効。 */
  autoHideDuration?: number | null;
  onClose?: () => void;
  anchorOrigin?: SnackbarAnchorOrigin;
  /** フェード/スライド時間(ms)。既定 225。 */
  timeout?: number;
  children?: ReactNode;
}

/**
 * MUI Snackbar の置換。document.body へ portal し anchorOrigin に応じて配置。
 * autoHideDuration 経過で onClose を発火する。閉じた後はフェード完了後にアンマウント。
 */
export function Snackbar({
  open,
  autoHideDuration = null,
  onClose,
  anchorOrigin = { vertical: "bottom", horizontal: "center" },
  timeout = 225,
  children,
}: Readonly<SnackbarProps>) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = setTimeout(() => setMounted(false), timeout);
    return () => clearTimeout(id);
  }, [open, timeout]);

  useEffect(() => {
    if (!open || autoHideDuration == null) return undefined;
    const id = setTimeout(() => onClose?.(), autoHideDuration);
    return () => clearTimeout(id);
  }, [open, autoHideDuration, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const rootClass = [
    styles.root,
    styles[anchorOrigin.vertical],
    styles[anchorOrigin.horizontal],
    visible && styles.visible,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={rootClass} style={{ ["--snackbar-duration" as string]: `${timeout}ms` }}>
      {children}
    </div>,
    document.body,
  );
}
