import { forwardRef } from "react";
import type { CSSProperties, ReactNode } from "react";

import styles from "./Alert.module.css";

export type AlertSeverity = "success" | "error" | "warning" | "info";

export interface AlertProps {
  severity?: AlertSeverity;
  /** filled=塗り（severity 色地に白文字）。standard は薄地。 */
  variant?: "filled" | "standard";
  onClose?: () => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// severity ごとの Material アイコン（filled variant 用、白）。
const ICON_PATHS: Record<AlertSeverity, string> = {
  success:
    "M20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4C12.76,4 13.5,4.11 14.2,4.31L15.77,2.74C14.61,2.26 13.34,2 12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12M7.91,10.08L6.5,11.5L11,16L21,6L19.59,4.58L11,13.17L7.91,10.08Z",
  error:
    "M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
  warning: "M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z",
  info: "M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
};

/** MUI Alert の置換。filled（snackbar 用）と standard。severity アイコン + 任意の閉じるボタン。
 *  MUI Snackbar のトランジションが子の ref を要求するため forwardRef 対応。 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  {
    severity = "success",
    variant = "standard",
    onClose,
    children,
    className,
    style,
    ...rest
  }: Readonly<AlertProps>,
  ref,
) {
  const classes = [styles.root, styles[variant], styles[severity], className]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={ref} role="alert" className={classes} style={style} {...rest}>
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d={ICON_PATHS[severity]} />
        </svg>
      </span>
      <span className={styles.message}>{children}</span>
      {onClose && (
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
          </svg>
        </button>
      )}
    </div>
  );
});
