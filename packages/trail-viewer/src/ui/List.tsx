import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ListProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly dense?: boolean;
  readonly disablePadding?: boolean;
  readonly sx?: Record<string, unknown>;
}

/** MUI List の置換。 */
export function List({
  children,
  style,
  className,
  dense: _dense,
  disablePadding: _disablePadding,
  sx,
}: Readonly<ListProps>) {
  injectTrailUiStyles();
  const classes = ["trv-list", className].filter(Boolean).join(" ");
  return (
    <ul className={classes} style={{ ...sxToStyle(sx), ...style }}>
      {children}
    </ul>
  );
}
