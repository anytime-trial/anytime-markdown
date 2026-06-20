import type { CSSProperties, ReactNode, SyntheticEvent } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface TabProps {
  readonly value: string;
  readonly label: ReactNode;
  readonly style?: CSSProperties;
  readonly disabled?: boolean;
  /** Tabs から注入される（直接指定不要）。 */
  readonly selected?: boolean;
  readonly onSelect?: (value: string, event: SyntheticEvent) => void;
  readonly icon?: ReactNode;
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
}: Readonly<TabProps>) {
  injectTrailUiStyles();
  const classes = ["trv-tab", selected ? "trv-selected" : ""].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={disabled}
      className={classes}
      style={style}
      onClick={(e) => !disabled && onSelect?.(value, e)}
    >
      {icon}
      {label}
    </button>
  );
}
