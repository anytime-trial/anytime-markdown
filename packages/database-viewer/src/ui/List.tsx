import type { CSSProperties, ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface ListProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI List(dense, disablePadding) の置換。 */
export function List({ children, style, className }: Readonly<ListProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-list", className].filter(Boolean).join(" ");
  return (
    <ul className={classes} style={style}>
      {children}
    </ul>
  );
}
