import type { HTMLAttributes } from "react";

import styles from "./Divider.module.css";

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
  flexItem?: boolean;
}

/** MUI Divider の置換。1px のラインを `--am-color-divider` で描画。 */
export function Divider({
  orientation = "horizontal",
  flexItem,
  className,
  ...rest
}: Readonly<DividerProps>) {
  const classes = [
    styles.root,
    orientation === "vertical" ? styles.vertical : styles.horizontal,
    flexItem ? styles.flexItem : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <hr className={classes} {...rest} />;
}
