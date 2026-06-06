import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";

import styles from "./ToggleButton.module.css";
import { useToggleButtonGroup, type ToggleSize } from "./ToggleButtonGroup";

export interface ToggleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value?: unknown;
  /** 親 Group が value を持たない場合に selected 状態を直接制御する。 */
  selected?: boolean;
  size?: ToggleSize;
  children?: ReactNode;
}

/**
 * MUI ToggleButton の置換。selected は親 Group の `value` 一致、無ければ `selected` prop で決まる。
 * バリアント（standard / pill）は親 Group から継承する。
 */
export function ToggleButton({
  value,
  selected,
  size,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: Readonly<ToggleButtonProps>) {
  const group = useToggleButtonGroup();
  const variant = group?.variant ?? "standard";
  const effectiveSize = size ?? group?.size ?? "small";
  const isSelected =
    group && group.value !== undefined ? group.value === value : !!selected;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    group?.onChange?.(event, value);
  };

  const classes = [
    styles.button,
    styles[variant],
    styles[effectiveSize],
    isSelected ? styles.selected : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      aria-pressed={isSelected}
      className={classes}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  );
}
