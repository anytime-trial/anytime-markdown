import type { ButtonHTMLAttributes } from "react";

import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "small" | "medium";
}

/** MUI IconButton の置換（PoC）。円形・hover 背景・focus リングを再現。 */
export function IconButton({
  size = "medium",
  className,
  children,
  type = "button",
  ...rest
}: Readonly<IconButtonProps>) {
  const classes = [styles.iconButton, styles[size], className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
