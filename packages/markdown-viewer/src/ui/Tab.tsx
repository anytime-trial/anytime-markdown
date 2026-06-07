import { useContext } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { useIsDark } from "../contexts/ThemeModeContext";
import { getPrimaryMain, getTextSecondary } from "../constants/colors";
import { TabsContext } from "./Tabs";
import styles from "./Tab.module.css";

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  /** このタブの識別値。親 Tabs の value と一致したとき選択状態になる。 */
  value: string;
  /** タブのラベル。children でも可（MUI Tab の label prop 互換）。 */
  label?: ReactNode;
}

/**
 * MUI Tab の置換。親 Tabs の context から選択状態を取得し、選択中はテキスト色 primary +
 * 下線インジケータを点灯する。非選択は textSecondary。クリックで親の onChange(event, value) を発火。
 */
export function Tab({ value, label, className, style, children, ...rest }: Readonly<TabProps>) {
  const ctx = useContext(TabsContext);
  const isDark = useIsDark();
  const selected = ctx?.value === value;
  const primary = getPrimaryMain(isDark);
  const classes = [styles.tab, className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={classes}
      style={{
        color: selected ? primary : getTextSecondary(isDark),
        borderBottomColor: selected ? primary : "transparent",
        ...style,
      }}
      onClick={(event) => ctx?.onChange?.(event, value)}
      {...rest}
    >
      {label ?? children}
    </button>
  );
}
