import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** パディングでサイズが決まる（アイコン寸法は icon 側 fontSize が決定）。
   *  xs=2px / compact=4px / small=5px / medium=8px（MUI spacing 0.25/0.5/0.625/1 相当）。 */
  size?: "xs" | "compact" | "small" | "medium";
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
