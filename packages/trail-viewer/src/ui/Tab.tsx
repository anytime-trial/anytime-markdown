import type { ButtonHTMLAttributes, CSSProperties, ReactNode, SyntheticEvent } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface TabProps extends Pick<ButtonHTMLAttributes<HTMLButtonElement>, "id" | "aria-controls" | "onMouseEnter" | "onFocus"> {
  readonly value: string | number;
  readonly label?: ReactNode;
  readonly style?: CSSProperties;
  readonly disabled?: boolean;
  /** Tabs から注入される（直接指定不要）。 */
  readonly selected?: boolean;
  readonly onSelect?: (value: string | number, event: SyntheticEvent) => void;
  readonly icon?: ReactNode;
  readonly iconPosition?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI Tab の置換。クリックで親 Tabs の onChange を発火する。 */
export function Tab({
  value,
  label,
  style,
  selected,
  onSelect,
  disabled,
  icon,
  iconPosition: _iconPosition,
  sx,
  id,
  ...rest
}: Readonly<TabProps>) {
  injectTrailUiStyles();
  const classes = ["trv-tab", selected ? "trv-selected" : ""].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      disabled={disabled}
      className={classes}
      style={{ ...sxToStyle(sx), ...style }}
      onClick={(e) => !disabled && onSelect?.(value, e)}
      {...rest}
    >
      {icon}
      {label}
    </button>
  );
}
