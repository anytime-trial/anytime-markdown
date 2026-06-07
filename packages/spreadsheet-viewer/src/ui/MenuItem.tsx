import type { ReactNode } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

export interface MenuItemProps {
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/** MUI MenuItem の置換。 */
export function MenuItem({ onClick, disabled, children, className }: Readonly<MenuItemProps>) {
  injectSpreadsheetUiStyles();
  const classes = ["sv-menu-item", className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role="menuitem"
      className={classes}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
