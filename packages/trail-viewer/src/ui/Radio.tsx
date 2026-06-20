import type { ChangeEvent, CSSProperties, InputHTMLAttributes } from "react";
import { useId } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface RadioProps {
  readonly checked?: boolean;
  readonly onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium";
  readonly id?: string;
  readonly name?: string;
  readonly value?: string;
  readonly inputProps?: InputHTMLAttributes<HTMLInputElement>;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

const ICON_UNCHECKED = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
  </svg>
);
const ICON_CHECKED = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
  </svg>
);

/** MUI Radio の置換。ラジオボタン。 */
export function Radio({
  checked = false,
  onChange,
  disabled,
  size: _size,
  id,
  name,
  value,
  inputProps,
  sx,
  style,
}: Readonly<RadioProps>) {
  injectTrailUiStyles();
  const autoId = useId();
  const inputId = id ?? autoId;
  const classes = [
    "trv-radio",
    checked ? "trv-radio--checked" : "",
    disabled ? "trv-radio--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} style={{ ...sxToStyle(sx), ...style }}>
      <input
        id={inputId}
        type="radio"
        checked={checked}
        disabled={disabled}
        name={name}
        value={value}
        onChange={onChange}
        {...inputProps}
      />
      {checked ? ICON_CHECKED : ICON_UNCHECKED}
    </span>
  );
}
