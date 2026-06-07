import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

type Variant = "text" | "outlined" | "contained";
type Color = "primary" | "inherit";
type Size = "small" | "medium";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  readonly variant?: Variant;
  readonly color?: Color;
  readonly size?: Size;
  readonly startIcon?: ReactNode;
}

/** MUI Button の置換。text / outlined / contained × primary / inherit。 */
export function Button({
  variant = "text",
  color = "primary",
  size = "medium",
  startIcon,
  className,
  children,
  type = "button",
  ...rest
}: Readonly<ButtonProps>) {
  injectSpreadsheetUiStyles();
  const classes = [
    "sv-btn",
    `sv-btn--${variant}`,
    color === "inherit" ? "sv-btn--inherit" : "",
    size === "small" ? "sv-btn--small" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {startIcon}
      {children}
    </button>
  );
}
