import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface DialogContentProps {
  readonly children?: ReactNode;
  readonly dividers?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI DialogContent の置換。 */
export function DialogContent({
  children,
  dividers,
  style,
  className,
  sx,
}: Readonly<DialogContentProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-dialog-content",
    dividers ? "trv-dialog-content--dividers" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} style={{ ...sxToStyle(sx), ...style }}>
      {children}
    </div>
  );
}
