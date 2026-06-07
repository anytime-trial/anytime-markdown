import type { ChangeEvent, InputHTMLAttributes } from "react";

import styles from "./Radio.module.css";

export interface RadioProps {
  checked?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  value?: string;
  name?: string;
  disabled?: boolean;
  /** MUI size。small=20px アイコン / medium=24px（既定）。 */
  size?: "small" | "medium";
  /** input 要素への追加属性（aria-label 等）。MUI の slotProps.input 相当。 */
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

/**
 * MUI Radio の置換。ring + dot + 透明 radio input。RadioGroup / FormControlLabel と
 * 組み合わせて使う（FormControlLabel が context 経由で checked / onChange / value を注入）。
 */
export function Radio({
  checked,
  onChange,
  value,
  name,
  disabled,
  size = "medium",
  inputProps,
}: Readonly<RadioProps>) {
  const className = [
    styles.root,
    size === "small" && styles.small,
    checked && styles.checked,
    disabled && styles.disabled,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className}>
      <span className={styles.ring} />
      <span className={styles.dot} />
      <input
        type="radio"
        className={styles.input}
        checked={checked}
        onChange={onChange}
        value={value}
        name={name}
        disabled={disabled}
        {...inputProps}
      />
    </span>
  );
}
