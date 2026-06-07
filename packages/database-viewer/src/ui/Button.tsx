import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

type Variant = "text" | "contained";
type Size = "small" | "medium";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly startIcon?: ReactNode;
}

/** MUI Button の置換。text / contained。 */
export function Button({
  variant = "text",
  size = "medium",
  startIcon,
  className,
  children,
  type = "button",
  ...rest
}: Readonly<ButtonProps>) {
  injectDatabaseUiStyles();
  const classes = [
    "dbv-btn",
    `dbv-btn--${variant}`,
    size === "small" ? "dbv-btn--small" : "",
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
