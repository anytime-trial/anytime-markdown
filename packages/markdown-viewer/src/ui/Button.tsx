import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

type Variant = "text" | "outlined" | "contained";
type Color = "primary" | "error" | "inherit";
type Size = "small" | "medium";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: Variant;
  color?: Color;
  size?: Size;
  startIcon?: ReactNode;
}

/** MUI Button の置換（PoC）。text/outlined/contained × primary/error/inherit を再現。 */
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
  const colorClass = resolveColorClass(variant, color);
  const classes = [styles.button, styles[size], styles[variant], colorClass, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {startIcon}
      {children}
    </button>
  );
}

function resolveColorClass(variant: Variant, color: Color): string {
  if (variant === "contained") {
    return color === "error" ? styles.containedError : styles.containedPrimary;
  }
  if (color === "error") return styles.errorText;
  if (color === "inherit") return styles.inheritText;
  return styles.primaryText;
}
