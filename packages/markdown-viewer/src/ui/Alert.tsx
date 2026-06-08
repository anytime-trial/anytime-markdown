import { forwardRef } from "react";
import type { CSSProperties, ReactNode } from "react";

import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";
import styles from "./Alert.module.css";

export type AlertSeverity = "success" | "error";

export interface AlertProps {
  severity?: AlertSeverity;
  onClose?: () => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// severity ごとの Material アイコン（filled・白）。
const ICON_PATHS: Record<AlertSeverity, string> = {
  success:
    "M20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4C12.76,4 13.5,4.11 14.2,4.31L15.77,2.74C14.61,2.26 13.34,2 12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12M7.91,10.08L6.5,11.5L11,16L21,6L19.59,4.58L11,13.17L7.91,10.08Z",
  error:
    "M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
};

/** MUI Alert(filled) の置換。snackbar 通知用に severity 色地・白文字。
 *  MUI Snackbar のトランジションが子の ref を要求するため forwardRef 対応。 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { severity = "success", onClose, children, className, style, ...rest }: Readonly<AlertProps>,
  ref,
) {
  const classes = [styles.root, styles[severity], className].filter(Boolean).join(" ");
  return (
    <div ref={ref} role="alert" className={classes} style={style} {...rest}>
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d={ICON_PATHS[severity]} />
        </svg>
      </span>
      <span className={styles.message}>{children}</span>
      {onClose && (
        <IconButton className={styles.close} size="compact" aria-label="Close" onClick={onClose}>
          <CloseIcon fontSize={20} />
        </IconButton>
      )}
    </div>
  );
});
