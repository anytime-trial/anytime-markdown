import { createContext, useContext, useMemo } from "react";
import type { ChangeEvent, ReactNode } from "react";

import styles from "./RadioGroup.module.css";

export interface RadioGroupContextValue {
  name?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>, value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

/** FormControlLabel から親 RadioGroup の選択状態・onChange を取得する。 */
export function useRadioGroup(): RadioGroupContextValue | null {
  return useContext(RadioGroupContext);
}

export interface RadioGroupProps {
  value?: string;
  name?: string;
  /** 横並びにする（MUI の row）。 */
  row?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>, value: string) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * MUI RadioGroup の置換。context で value / name / onChange を子 FormControlLabel に配る。
 */
export function RadioGroup({
  value,
  name,
  row,
  onChange,
  children,
  className,
}: Readonly<RadioGroupProps>) {
  const ctx = useMemo<RadioGroupContextValue>(
    () => ({ value, name, onChange }),
    [value, name, onChange],
  );

  const rootClass = [styles.root, row && styles.row, className].filter(Boolean).join(" ");

  return (
    <RadioGroupContext.Provider value={ctx}>
      <div role="radiogroup" className={rootClass}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}
