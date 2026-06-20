import type { ChangeEvent, CSSProperties, InputHTMLAttributes, MouseEventHandler } from "react";
import { useId } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface CheckboxProps {
  readonly checked?: boolean;
  readonly onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly onClick?: MouseEventHandler<HTMLElement>;
  readonly indeterminate?: boolean;
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
    <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
  </svg>
);
const ICON_CHECKED = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
);
const ICON_INDETERMINATE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z" />
  </svg>
);

/** MUI Checkbox の置換。チェックボックス（SVGアイコン使用）。 */
export function Checkbox({
  checked = false,
  onChange,
  onClick,
  indeterminate,
  disabled,
  size: _size,
  id,
  name,
  value,
  inputProps,
  sx,
  style,
}: Readonly<CheckboxProps>) {
  injectTrailUiStyles();
  const autoId = useId();
  const inputId = id ?? autoId;
  const isChecked = indeterminate ? false : checked;
  const classes = [
    "trv-checkbox",
    checked || indeterminate ? "trv-checkbox--checked" : "",
    disabled ? "trv-checkbox--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} style={{ ...sxToStyle(sx), ...style }} onClick={onClick}>
      <input
        id={inputId}
        type="checkbox"
        checked={isChecked}
        disabled={disabled}
        name={name}
        value={value}
        onChange={onChange}
        {...inputProps}
      />
      {indeterminate ? ICON_INDETERMINATE : checked ? ICON_CHECKED : ICON_UNCHECKED}
    </span>
  );
}
