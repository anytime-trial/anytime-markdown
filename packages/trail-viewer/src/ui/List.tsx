import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface ListProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly dense?: boolean;
  readonly disablePadding?: boolean;
}

/** MUI List の置換。 */
export function List({
  children,
  style,
  className,
  dense: _dense,
  disablePadding: _disablePadding,
}: Readonly<ListProps>) {
  injectTrailUiStyles();
  const classes = ["trv-list", className].filter(Boolean).join(" ");
  return (
    <ul className={classes} style={style}>
      {children}
    </ul>
  );
}
