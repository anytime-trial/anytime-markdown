import type { CSSProperties, ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface TabProps {
  readonly value: string;
  readonly label: ReactNode;
  readonly style?: CSSProperties;
  /** Tabs から注入される（直接指定不要）。 */
  readonly selected?: boolean;
  readonly onSelect?: (value: string) => void;
}

/** MUI Tab の置換。クリックで親 Tabs の onChange を発火する。 */
export function Tab({ value, label, style, selected, onSelect }: Readonly<TabProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-tab", selected ? "dbv-selected" : ""].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={classes}
      style={style}
      onClick={() => onSelect?.(value)}
    >
      {label}
    </button>
  );
}
