import { cloneElement, isValidElement } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";

import { useRadioGroup } from "./RadioGroup";
import styles from "./FormControlLabel.module.css";

export interface FormControlLabelProps {
  /** Radio などの制御要素。RadioGroup 配下では checked / onChange / value / name を注入する。 */
  control: ReactElement;
  label: ReactNode;
  value?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * MUI FormControlLabel の置換。親 RadioGroup の context を読み、control に
 * checked / onChange / value / name を clone 注入してラベルと横並びにする。
 */
export function FormControlLabel({
  control,
  label,
  value,
  disabled,
  className,
}: Readonly<FormControlLabelProps>) {
  const group = useRadioGroup();

  const injected: Record<string, unknown> = {};
  if (group && value !== undefined) {
    injected.checked = group.value === value;
    injected.value = value;
    if (group.name !== undefined) injected.name = group.name;
    injected.onChange = (event: ChangeEvent<HTMLInputElement>) => {
      group.onChange?.(event, value);
    };
  }
  if (disabled) injected.disabled = true;

  const merged = isValidElement(control) ? cloneElement(control, injected) : control;

  const rootClass = [styles.root, disabled && styles.disabled, className]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={rootClass}>
      {merged}
      <span className={styles.label}>{label}</span>
    </label>
  );
}
