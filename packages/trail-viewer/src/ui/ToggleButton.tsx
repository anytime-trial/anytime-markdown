import type { ReactNode, SyntheticEvent } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface ToggleButtonProps {
  readonly value: string;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium" | "large";
  readonly className?: string;
  /** ToggleButtonGroup から注入される（直接指定不要）。 */
  readonly selected?: boolean;
  readonly onChange?: (e: SyntheticEvent, value: string) => void;
}

/** MUI ToggleButton の置換。 */
export function ToggleButton({
  value,
  children,
  disabled,
  size,
  className,
  selected,
  onChange,
}: Readonly<ToggleButtonProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-toggle-btn",
    selected ? "trv-selected" : "",
    size === "small" ? "trv-toggle-btn--small" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      aria-pressed={selected}
      onClick={(e) => !disabled && onChange?.(e, value)}
    >
      {children}
    </button>
  );
}
