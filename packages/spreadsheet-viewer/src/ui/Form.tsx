import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement, useId } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

/** MUI FormControl の置換（縦積みコンテナ）。 */
export function FormControl({ children }: Readonly<{ children: ReactNode }>) {
  injectSpreadsheetUiStyles();
  return <div className="sv-form-control">{children}</div>;
}

/** MUI FormLabel の置換。 */
export function FormLabel({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="sv-form-label">{children}</div>;
}

interface RadioInjectedProps {
  readonly _name?: string;
  readonly _selectedValue?: string;
  readonly _onSelect?: (value: string) => void;
}

export interface RadioGroupProps {
  readonly row?: boolean;
  readonly value: string;
  readonly onChange: (e: { target: { value: string } }) => void;
  readonly children: ReactNode;
}

/** MUI RadioGroup の置換。FormControlLabel 子へ選択状態を注入する。 */
export function RadioGroup({ row, value, onChange, children }: Readonly<RadioGroupProps>) {
  injectSpreadsheetUiStyles();
  const name = useId();
  const onSelect = (next: string): void => onChange({ target: { value: next } });
  const injected = Array.isArray(children) ? children : [children];
  return (
    <div style={{ display: "flex", flexDirection: row ? "row" : "column", gap: row ? 12 : 4 }}>
      {injected.map((child, i) =>
        isValidElement(child)
          ? cloneElement(child as ReactElement<RadioInjectedProps>, {
              key: i,
              _name: name,
              _selectedValue: value,
              _onSelect: onSelect,
            })
          : child,
      )}
    </div>
  );
}

export interface FormControlLabelProps extends RadioInjectedProps {
  readonly value: string;
  readonly control: ReactElement;
  readonly label: ReactNode;
}

/** MUI FormControlLabel の置換。control（Radio）に選択状態を流す。 */
export function FormControlLabel({
  value,
  control,
  label,
  _name,
  _selectedValue,
  _onSelect,
}: Readonly<FormControlLabelProps>) {
  injectSpreadsheetUiStyles();
  const radio = cloneElement(control as ReactElement<RadioProps>, {
    name: _name,
    checked: _selectedValue === value,
    onChange: () => _onSelect?.(value),
  });
  return (
    <label className="sv-form-control-label">
      {radio}
      {label}
    </label>
  );
}

export interface RadioProps {
  readonly size?: "small" | "medium";
  readonly name?: string;
  readonly checked?: boolean;
  readonly onChange?: () => void;
}

/** MUI Radio の置換（native radio + accent-color）。 */
export function Radio({ name, checked, onChange }: Readonly<RadioProps>) {
  return (
    <input type="radio" className="sv-radio" name={name} checked={checked} onChange={onChange} />
  );
}
