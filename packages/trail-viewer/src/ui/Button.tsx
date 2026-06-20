import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

type Variant = "text" | "outlined" | "contained";
type Size = "small" | "medium" | "large";
type Color = "primary" | "error" | "inherit";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly color?: Color;
  readonly startIcon?: ReactNode;
  readonly endIcon?: ReactNode;
  readonly fullWidth?: boolean;
  readonly children?: ReactNode;
}

/** MUI Button の置換。text / outlined / contained。 */
export function Button({
  variant = "text",
  size = "medium",
  color = "primary",
  startIcon,
  endIcon,
  fullWidth,
  className,
  children,
  type = "button",
  ...rest
}: Readonly<ButtonProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-btn",
    `trv-btn--${variant}`,
    size === "small" ? "trv-btn--small" : "",
    color !== "primary" ? `trv-btn--${color}` : "",
    fullWidth ? "trv-btn--fullwidth" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
