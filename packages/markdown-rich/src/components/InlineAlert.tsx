import type { CSSProperties, ReactNode } from "react";

import {
  getErrorBg, getErrorMain, getInfoBg, getInfoMain,
  getSuccessBg, getSuccessMain, getWarningBg, getWarningMain, useIsDark,
} from "@anytime-markdown/markdown-viewer";
import {
  CheckIcon, ErrorOutlineIcon, InfoOutlinedIcon, WarningAmberIcon,
} from "@anytime-markdown/markdown-viewer/src/ui/icons";
import type { IconComponent } from "@anytime-markdown/markdown-viewer/src/ui/icons";

import styles from "./InlineAlert.module.css";

export type InlineAlertSeverity = "error" | "warning" | "info" | "success";

export interface InlineAlertProps {
  severity?: InlineAlertSeverity;
  /** 既定アイコンを上書きする場合に指定（MUI Alert の icon prop 相当）。 */
  icon?: ReactNode;
  /** 右端のアクション領域（ボタン等。MUI Alert の action prop 相当）。 */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentEditable?: boolean;
}

const SEVERITY: Record<InlineAlertSeverity, {
  bg: (isDark: boolean) => string;
  main: (isDark: boolean) => string;
  Icon: IconComponent;
}> = {
  error: { bg: getErrorBg, main: getErrorMain, Icon: ErrorOutlineIcon },
  warning: { bg: getWarningBg, main: getWarningMain, Icon: WarningAmberIcon },
  info: { bg: getInfoBg, main: getInfoMain, Icon: InfoOutlinedIcon },
  success: { bg: getSuccessBg, main: getSuccessMain, Icon: CheckIcon },
};

/**
 * MUI standard variant Alert（薄い地色 + severity 色の文字/アイコン）の置換。
 * filled の `ui/Alert`（snackbar 用）とは別物で、rich のインライン診断表示に使う。
 * 色はプロジェクトパレットの severity トークン（get*Bg / get*Main）で再現する。
 */
export function InlineAlert({
  severity = "success", icon, action, children, className, style, contentEditable,
}: Readonly<InlineAlertProps>) {
  const isDark = useIsDark();
  const { bg, main, Icon } = SEVERITY[severity];
  const color = main(isDark);
  const classes = [styles.root, className].filter(Boolean).join(" ");
  return (
    <div
      role="alert"
      className={classes}
      contentEditable={contentEditable}
      style={{ backgroundColor: bg(isDark), color, ...style }}
    >
      <span className={styles.icon} style={{ color }}>
        {icon ?? <Icon fontSize={22} />}
      </span>
      <span className={styles.message}>{children}</span>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
