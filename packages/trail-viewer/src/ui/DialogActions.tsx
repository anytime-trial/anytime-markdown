import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface DialogActionsProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly disableSpacing?: boolean;
}

/** MUI DialogActions の置換。 */
export function DialogActions({
  children,
  style,
  className,
  disableSpacing: _disableSpacing,
}: Readonly<DialogActionsProps>) {
  injectTrailUiStyles();
  const classes = ["trv-dialog-actions", className].filter(Boolean).join(" ");
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
