import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
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
  injectSpreadsheetUiStyles();
  const classes = ["sv-icon-btn", size === "small" ? "sv-icon-btn--small" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
