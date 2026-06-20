import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface MenuItemProps {
  readonly value?: string | number | unknown;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dense?: boolean;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI MenuItem の置換。Menu 内のアイテム、および Select の option ソースとしても使用。 */
export function MenuItem({
  value: _value,
  onClick,
  disabled,
  selected,
  children,
  className,
  dense: _dense,
  sx,
  style,
}: Readonly<MenuItemProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-menu-item",
    selected ? "trv-selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      role="menuitem"
      className={classes}
      disabled={disabled}
      aria-disabled={disabled}
      aria-selected={selected}
      onClick={onClick}
      style={{ ...sxToStyle(sx), ...style }}
    >
      {children}
    </button>
  );
}
