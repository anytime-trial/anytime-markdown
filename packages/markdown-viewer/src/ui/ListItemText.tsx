import type { CSSProperties, ReactNode } from "react";

import styles from "./ListItemText.module.css";

export interface ListItemTextProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** MUI ListItemText の置換。MenuItem 内のテキスト枠（flex 伸長・font は MenuItem から継承）。 */
export function ListItemText({ className, style, children }: Readonly<ListItemTextProps>) {
  const classes = [styles.root, className].filter(Boolean).join(" ");
  return (
    <span className={classes} style={style}>
      {children}
    </span>
  );
}
