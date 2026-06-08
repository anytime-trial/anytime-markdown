import type { ChangeEvent, InputHTMLAttributes } from "react";

import styles from "./Switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** input 要素への追加属性（role / aria-label / disabled 等）。MUI の slotProps.input 相当。 */
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

/**
 * MUI Switch（size="small"）の置換。track + thumb + 透明チェックボックス。
 * 実測値（40x24 / track inset7 / thumb16 / translateX16）を再現。off/on の色は seam
 * トークン（--am-color-switch-* / --am-color-primary-main）。
 */
export function Switch({ checked, onChange, inputProps }: Readonly<SwitchProps>) {
  return (
    <span className={styles.root}>
      <span className={[styles.switchBase, checked && styles.checked].filter(Boolean).join(" ")}>
        <span className={styles.thumb} />
      </span>
      <span className={styles.track} />
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={onChange}
        {...inputProps}
      />
    </span>
  );
}
