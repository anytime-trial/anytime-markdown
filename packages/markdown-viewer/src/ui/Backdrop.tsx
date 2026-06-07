import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Backdrop.module.css";

export interface BackdropProps {
  open: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** フェード時間(ms)。既定 225。 */
  timeout?: number;
}

/**
 * MUI Backdrop の置換。document.body へ portal し、open に応じてフェード表示。
 * 閉じた後はフェード完了を待ってアンマウントする。
 */
export function Backdrop({ open, className, style, children, timeout = 225 }: Readonly<BackdropProps>) {
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

  if (!mounted || typeof document === "undefined") return null;

  const rootClass = [styles.root, visible && styles.visible, className].filter(Boolean).join(" ");

  return createPortal(
    <div className={rootClass} style={{ ["--backdrop-duration" as string]: `${timeout}ms`, ...style }}>
      {children}
    </div>,
    document.body,
  );
}
