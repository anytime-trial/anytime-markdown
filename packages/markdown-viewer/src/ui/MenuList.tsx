import { createContext, forwardRef, useContext } from "react";
import type { HTMLAttributes, ReactNode } from "react";

import styles from "./MenuList.module.css";

/** MenuList の dense を子 MenuItem へ伝える。 */
export const MenuDenseContext = createContext(false);
export const useMenuDense = (): boolean => useContext(MenuDenseContext);

export interface MenuListProps extends HTMLAttributes<HTMLUListElement> {
  dense?: boolean;
  children?: ReactNode;
}

/** MUI MenuList の置換。`<ul>`（padding 8px 0）。dense は context で子 MenuItem に伝播。 */
export const MenuList = forwardRef<HTMLUListElement, MenuListProps>(function MenuList(
  { dense = false, className, children, ...rest }: Readonly<MenuListProps>,
  ref,
) {
  const classes = [styles.menuList, className].filter(Boolean).join(" ");
  return (
    <MenuDenseContext.Provider value={dense}>
      <ul ref={ref} className={classes} {...rest}>
        {children}
      </ul>
    </MenuDenseContext.Provider>
  );
});
