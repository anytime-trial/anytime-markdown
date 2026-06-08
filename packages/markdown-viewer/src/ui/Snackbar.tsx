import { useEffect, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Snackbar.module.css";
import { useTransitionMount } from "./useTransitionMount";

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
  const { mounted, visible } = useTransitionMount(open, timeout);
  const style = useMemo<CSSProperties>(
    () => ({ ["--snackbar-duration" as string]: `${timeout}ms` }),
    [timeout],
  );

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
    <div className={rootClass} style={style}>
      {children}
    </div>,
    document.body,
  );
}
