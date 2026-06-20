import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface DialogActionsProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly disableSpacing?: boolean;
  readonly sx?: Record<string, unknown>;
}

/** MUI DialogActions の置換。 */
export function DialogActions({
  children,
  style,
  className,
  disableSpacing: _disableSpacing,
  sx,
}: Readonly<DialogActionsProps>) {
  injectTrailUiStyles();
  const classes = ["trv-dialog-actions", className].filter(Boolean).join(" ");
  return (
    <div className={classes} style={{ ...sxToStyle(sx), ...style }}>
      {children}
    </div>
  );
}
