import type { ChangeEvent, CSSProperties, ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { MenuItemProps } from "./MenuItem";
import { sxToStyle } from "./sx";

/** MUI SelectChangeEvent 互換型。 */
export interface SelectChangeEvent<T = string> {
  readonly target: {
    readonly value: T;
    readonly name?: string;
  };
}

export interface SelectProps<T extends string = string> {
  readonly value: T;
  readonly onChange: (event: SelectChangeEvent<T>) => void;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium";
  readonly fullWidth?: boolean;
  readonly label?: string;
  readonly name?: string;
  readonly multiple?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly displayEmpty?: boolean;
  /** MUI 互換: FormControl の labelId を受け取るが視覚的には未配線。 */
  readonly labelId?: string;
  readonly sx?: Record<string, unknown>;
}

/**
 * MUI Select の置換。ネイティブ <select> を使用する。
 * 子要素の MenuItem から value / children を取得して <option> に変換する。
 */
export function Select<T extends string = string>({
  value,
  onChange,
  children,
  disabled,
  size,
  fullWidth,
  label: _label,
  labelId: _labelId, // accepted for MUI compatibility; not visually wired
  name,
  multiple,
  style,
  className,
  sx,
}: Readonly<SelectProps<T>>) {
  injectTrailUiStyles();
  const classes = [
    "trv-select",
    size === "small" ? "trv-select--small" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    onChange({ target: { value: e.target.value as T, name } });
  };

  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const el = child as ReactElement<MenuItemProps>;
      const optValue = String(el.props.value ?? "");
      return (
        <option key={optValue} value={optValue} disabled={el.props.disabled}>
          {el.props.children}
        </option>
      );
    });

  const composed: CSSProperties = {
    ...sxToStyle(sx),
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };

  return (
    <select
      className={classes}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      name={name}
      multiple={multiple}
      style={composed}
    >
      {options}
    </select>
  );
}
