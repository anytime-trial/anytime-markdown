import type { ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export type AlertSeverity = "error" | "warning" | "info" | "success";

export interface AlertProps {
  readonly severity?: AlertSeverity;
  readonly children: ReactNode;
}

/** MUI Alert(standard variant) の置換。severity ごとに semantic 色を適用する。 */
export function Alert({ severity = "info", children }: Readonly<AlertProps>) {
  injectDatabaseUiStyles();
  return (
    <div className={`dbv-alert dbv-alert--${severity}`} role="alert">
      {children}
    </div>
  );
}
