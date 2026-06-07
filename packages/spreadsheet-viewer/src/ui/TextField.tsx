import type { ChangeEvent, CSSProperties, InputHTMLAttributes } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  readonly value: string | number;
  readonly onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly size?: "small" | "medium";
  /** MUI 互換: htmlInput 属性（min/max 等）。 */
  readonly slotProps?: { readonly htmlInput?: InputHTMLAttributes<HTMLInputElement> };
  readonly style?: CSSProperties;
}

/** MUI TextField の置換（単一行 input）。 */
export function TextField({
  value,
  onChange,
  size,
  slotProps,
  disabled,
  style,
  className,
  ...rest
}: Readonly<TextFieldProps>) {
  injectSpreadsheetUiStyles();
  const classes = ["sv-textfield", className].filter(Boolean).join(" ");
  return (
    <input
      className={classes}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={style}
      {...slotProps?.htmlInput}
      {...rest}
    />
  );
}
