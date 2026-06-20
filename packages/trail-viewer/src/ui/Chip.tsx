import type { MouseEvent, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface ChipProps {
  readonly label: ReactNode;
  readonly size?: "small" | "medium";
  readonly onClick?: (e: MouseEvent<HTMLSpanElement>) => void;
  readonly onDelete?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** MUI Chip の最小置換（ラベルバッジ）。 */
export function Chip({
  label,
  size = "medium",
  onClick,
  onDelete: _onDelete,
  disabled,
  className,
}: Readonly<ChipProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-chip",
    size === "small" ? "trv-chip--small" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={classes}
      onClick={disabled ? undefined : onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={disabled}
    >
      {label}
    </span>
  );
}
