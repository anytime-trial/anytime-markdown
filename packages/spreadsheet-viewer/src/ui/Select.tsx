import type { CSSProperties, ReactNode } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

export interface SelectOption {
  readonly value: string | number;
  readonly label: ReactNode;
}

export interface SelectProps {
  readonly value: string | number;
  readonly options: ReadonlyArray<SelectOption>;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium";
  readonly style?: CSSProperties;
  readonly "aria-label"?: string;
}

/** MUI Select の置換。native `<select>` ベースでアクセシブル。 */
export function Select({
  value,
  options,
  onChange,
  disabled,
  style,
  "aria-label": ariaLabel,
}: Readonly<SelectProps>) {
  injectSpreadsheetUiStyles();
  return (
    <select
      className="sv-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={style}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
