import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface DialogTitleProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI DialogTitle の置換。 */
export function DialogTitle({
  children,
  style,
  className,
}: Readonly<DialogTitleProps>) {
  injectTrailUiStyles();
  const classes = ["trv-dialog-title", className].filter(Boolean).join(" ");
  return (
    <h2 className={classes} style={style}>
      {children}
    </h2>
  );
}
