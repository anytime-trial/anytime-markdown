import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface DialogTitleProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI DialogTitle の置換。 */
export function DialogTitle({
  children,
  style,
  className,
  sx,
}: Readonly<DialogTitleProps>) {
  injectTrailUiStyles();
  const classes = ["trv-dialog-title", className].filter(Boolean).join(" ");
  return (
    <h2 className={classes} style={{ ...sxToStyle(sx), ...style }}>
      {children}
    </h2>
  );
}
