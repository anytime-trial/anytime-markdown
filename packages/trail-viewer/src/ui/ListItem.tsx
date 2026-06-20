import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface ListItemProps extends HTMLAttributes<HTMLLIElement> {
  readonly children?: ReactNode;
  readonly disablePadding?: boolean;
  readonly secondaryAction?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI ListItem の置換（静的リスト行）。 */
export function ListItem({
  children,
  disablePadding,
  secondaryAction,
  style,
  className,
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
    <li className={classes} style={style} {...rest}>
      {children}
      {secondaryAction && (
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>
          {secondaryAction}
        </span>
      )}
    </li>
  );
}
