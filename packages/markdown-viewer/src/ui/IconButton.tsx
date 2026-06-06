import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "small" | "medium";
}

/** MUI IconButton の置換（PoC）。円形・hover 背景・focus リングを再現。anchorEl 等のため ref 転送に対応。 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "medium", className, children, type = "button", ...rest },
  ref,
) {
  const classes = [styles.iconButton, styles[size], className].filter(Boolean).join(" ");
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {children}
    </button>
  );
});
