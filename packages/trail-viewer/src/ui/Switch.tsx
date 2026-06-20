import type { ChangeEvent, InputHTMLAttributes } from "react";
import { useId } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface SwitchProps {
  readonly checked?: boolean;
  readonly onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium";
  readonly id?: string;
  readonly name?: string;
  readonly value?: string;
  readonly inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

/** MUI Switch の置換。トグルスイッチ。 */
export function Switch({
  checked = false,
  onChange,
  disabled,
  size: _size,
  id,
  name,
  value,
  inputProps,
}: Readonly<SwitchProps>) {
  injectTrailUiStyles();
  const autoId = useId();
  const inputId = id ?? autoId;
  const classes = [
    "trv-switch",
    checked ? "trv-switch--checked" : "",
    disabled ? "trv-switch--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <label className={classes} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        name={name}
        value={value}
        onChange={onChange}
        {...inputProps}
      />
      <span className="trv-switch-track" style={{ position: "relative" }}>
        <span className="trv-switch-thumb" />
      </span>
    </label>
  );
}
