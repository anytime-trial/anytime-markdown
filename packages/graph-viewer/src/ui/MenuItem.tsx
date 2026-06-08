import type { KeyboardEvent, ReactNode } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface MenuItemProps {
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/** MUI MenuItem の置換（`<li role="menuitem">`、MUI と同じ要素種別）。 */
export function MenuItem({ onClick, disabled, children, className }: Readonly<MenuItemProps>) {
  injectGraphUiStyles();
  const classes = ['gv-menu-item', disabled ? 'gv-menu-item--disabled' : '', className]
    .filter(Boolean)
    .join(' ');
  const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>): void => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <li
      role="menuitem"
      className={classes}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </li>
  );
}
