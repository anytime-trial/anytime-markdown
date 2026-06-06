import { createContext, useContext } from "react";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";

import styles from "./ToggleButtonGroup.module.css";

export type ToggleVariant = "standard" | "pill";
export type ToggleSize = "small" | "medium";

interface ToggleGroupContextValue {
  variant: ToggleVariant;
  size: ToggleSize;
  value?: unknown;
  onChange?: (event: MouseEvent<HTMLButtonElement>, value: unknown) => void;
}

const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null);

export function useToggleButtonGroup(): ToggleGroupContextValue | null {
  return useContext(ToggleGroupContext);
}

export interface ToggleButtonGroupProps<T = unknown>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  variant?: ToggleVariant;
  size?: ToggleSize;
  /** exclusive 選択時の選択値。指定すると子 ToggleButton の selected を value 一致で決定する。 */
  value?: T;
  exclusive?: boolean;
  onChange?: (event: MouseEvent<HTMLButtonElement>, value: T) => void;
  children?: ReactNode;
}

/**
 * MUI ToggleButtonGroup の置換。`standard`（連結ボーダー）/ `pill`（角丸地・モードトグル用）の
 * 2 バリアント。selected の制御は親で `value` を渡すか、各 ToggleButton の `selected` で行う。
 * `value` から型 `T` が推論され、`onChange(event, value: T)` が型付けされる。
 */
export function ToggleButtonGroup<T = unknown>({
  variant = "standard",
  size = "small",
  value,
  exclusive: _exclusive,
  onChange,
  className,
  children,
  ...rest
}: Readonly<ToggleButtonGroupProps<T>>) {
  const classes = [styles.group, styles[variant], className].filter(Boolean).join(" ");
  return (
    <ToggleGroupContext.Provider
      value={{
        variant,
        size,
        value,
        onChange: onChange as ToggleGroupContextValue["onChange"],
      }}
    >
      <div role="group" className={classes} {...rest}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}
