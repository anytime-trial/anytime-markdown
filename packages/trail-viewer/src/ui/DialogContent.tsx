import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface DialogContentProps {
  readonly children?: ReactNode;
  readonly dividers?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI DialogContent の置換。 */
export function DialogContent({
  children,
  dividers,
  style,
  className,
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
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
