import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export type AlertSeverity = "error" | "warning" | "info" | "success";

export interface AlertProps {
  readonly severity?: AlertSeverity;
  readonly children: ReactNode;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI Alert(standard variant) の置換。severity ごとに semantic 色を適用する。 */
export function Alert({ severity = "info", children, className, sx, style }: Readonly<AlertProps>) {
  injectTrailUiStyles();
  const classes = [`trv-alert trv-alert--${severity}`, className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="alert" style={{ ...sxToStyle(sx), ...style }}>
      {children}
    </div>
  );
}
