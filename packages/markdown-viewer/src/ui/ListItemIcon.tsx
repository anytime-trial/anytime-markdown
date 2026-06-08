import type { CSSProperties, ReactNode } from "react";

import styles from "./ListItemIcon.module.css";

export interface ListItemIconProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** MUI ListItemIcon の置換。MenuItem 内のアイコン枠（minWidth 36・action.active 色）。 */
export function ListItemIcon({ className, style, children }: Readonly<ListItemIconProps>) {
  const classes = [styles.root, className].filter(Boolean).join(" ");
  return (
    <span className={classes} style={style}>
      {children}
    </span>
  );
}
