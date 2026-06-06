import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Paper.module.css";

export interface PaperProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "elevation" | "outlined";
  children?: ReactNode;
}

/**
 * MUI Paper の置換。背景 `--am-color-bg-paper` / 文字 `--am-color-text-primary`。
 * `variant="outlined"` で `--am-color-divider` の 1px ボーダー。
 * elevation の影が必要な箇所は呼び出し側が `style` で `--am-elevation-*` を付与する。
 */
export function Paper({ variant = "elevation", className, ...rest }: Readonly<PaperProps>) {
  const classes = [
    styles.root,
    variant === "outlined" ? styles.outlined : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes} {...rest} />;
}
