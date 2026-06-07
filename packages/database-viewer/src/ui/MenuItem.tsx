import type { ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface MenuItemProps {
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/** MUI MenuItem の置換。 */
export function MenuItem({ onClick, disabled, children, className }: Readonly<MenuItemProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-menu-item", className].filter(Boolean).join(" ");
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
