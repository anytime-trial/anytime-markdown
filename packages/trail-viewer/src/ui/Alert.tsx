import type { ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export type AlertSeverity = "error" | "warning" | "info" | "success";

export interface AlertProps {
  readonly severity?: AlertSeverity;
  readonly children: ReactNode;
  readonly className?: string;
}

/** MUI Alert(standard variant) の置換。severity ごとに semantic 色を適用する。 */
export function Alert({ severity = "info", children, className }: Readonly<AlertProps>) {
  injectTrailUiStyles();
  const classes = [`trv-alert trv-alert--${severity}`, className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="alert">
      {children}
    </div>
  );
}
