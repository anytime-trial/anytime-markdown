import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: "small" | "medium" | "large";
  readonly color?: "inherit" | "primary" | "default";
  readonly children?: ReactNode;
}

/** MUI IconButton の置換。円形ホバー背景・disabled 半透明。 */
export function IconButton({
  size = "medium",
  color: _color,
  className,
  children,
  type = "button",
  ...rest
}: Readonly<IconButtonProps>) {
  injectTrailUiStyles();
  const classes = ["trv-icon-btn", size === "small" ? "trv-icon-btn--small" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
