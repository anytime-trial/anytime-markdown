import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ListItemProps extends HTMLAttributes<HTMLLIElement> {
  readonly children?: ReactNode;
  readonly disablePadding?: boolean;
  readonly secondaryAction?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI ListItem の置換（静的リスト行）。 */
export function ListItem({
  children,
  disablePadding,
  secondaryAction,
  style,
  className,
  sx,
  ...rest
}: Readonly<ListItemProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-list-item",
    disablePadding ? "trv-list-item--no-padding" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest}>
      {children}
      {secondaryAction && (
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>
          {secondaryAction}
        </span>
      )}
    </li>
  );
}
