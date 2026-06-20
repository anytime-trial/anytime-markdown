import type { ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface MenuItemProps {
  readonly value?: string | number;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/** MUI MenuItem の置換。Menu 内のアイテム、および Select の option ソースとしても使用。 */
export function MenuItem({
  value: _value,
  onClick,
  disabled,
  selected,
  children,
  className,
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
    >
      {children}
    </button>
  );
}
