import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: "small" | "medium";
  readonly children?: ReactNode;
}

/** MUI IconButton の置換。円形ホバー背景・disabled 半透明。 */
export function IconButton({
  size = "medium",
  className,
  children,
  type = "button",
  ...rest
}: Readonly<IconButtonProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-icon-btn", size === "small" ? "dbv-icon-btn--small" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
