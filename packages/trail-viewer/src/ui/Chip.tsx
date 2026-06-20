import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ChipProps {
  readonly label: ReactNode;
  readonly size?: "small" | "medium";
  readonly onClick?: (e: MouseEvent<HTMLSpanElement>) => void;
  readonly onDelete?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly color?: string;
  readonly variant?: "filled" | "outlined";
  readonly icon?: ReactNode;
  readonly clickable?: boolean;
  readonly component?: string;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI Chip の最小置換（ラベルバッジ）。 */
export function Chip({
  label,
  size = "medium",
  onClick,
  onDelete: _onDelete,
  disabled,
  className,
  color,
  variant,
  icon,
  clickable: _clickable,
  component: _component,
  sx,
  style,
}: Readonly<ChipProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-chip",
    size === "small" ? "trv-chip--small" : "",
    variant === "outlined" ? "trv-chip--outlined" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    ...(variant === "outlined"
      ? { border: "1px solid currentColor", backgroundColor: "transparent" }
      : {}),
    ...(color ? { color } : {}),
    ...style,
  };
  return (
    <span
      className={classes}
      style={composed}
      onClick={disabled ? undefined : onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={disabled}
    >
      {icon}
      {label}
    </span>
  );
}
