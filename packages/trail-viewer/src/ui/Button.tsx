import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

type Variant = "text" | "outlined" | "contained";
type Size = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly color?: string;
  readonly startIcon?: ReactNode;
  readonly endIcon?: ReactNode;
  readonly fullWidth?: boolean;
  readonly children?: ReactNode;
  readonly href?: string;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
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
  href: _href,
  sx,
  style,
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
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    ...(fullWidth ? { width: "100%" } : {}),
    ...(color && color !== "primary" && color !== "error" && color !== "inherit"
      ? { color }
      : {}),
    ...style,
  };
  return (
    <button type={type} className={classes} style={composed} {...rest}>
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
