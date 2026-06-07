import type { CSSProperties, LiHTMLAttributes, ReactNode } from "react";

import { useMenuDense } from "./MenuList";
import styles from "./MenuItem.module.css";

export interface MenuItemProps extends Omit<LiHTMLAttributes<HTMLLIElement>, "onClick"> {
  selected?: boolean;
  disabled?: boolean;
  /** 明示指定が無ければ親 MenuList の dense を継承。 */
  dense?: boolean;
  onClick?: (event: React.MouseEvent<HTMLLIElement>) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** MUI MenuItem の置換。`<li role="menuitem">`。dense は MenuList から継承。 */
export function MenuItem({
  selected = false,
  disabled = false,
  dense,
  onClick,
  className,
  style,
  children,
  role = "menuitem",
  ...rest
}: Readonly<MenuItemProps>) {
  const groupDense = useMenuDense();
  const isDense = dense ?? groupDense;
  const classes = [
    styles.menuItem,
    isDense ? styles.dense : null,
    selected ? styles.selected : null,
    disabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      role={role}
      aria-disabled={disabled || undefined}
      className={classes}
      style={style}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {children}
    </li>
  );
}
