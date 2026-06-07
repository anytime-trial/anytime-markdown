import type { ChangeEvent, CSSProperties, InputHTMLAttributes } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  readonly value: string | number;
  readonly onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly size?: "small" | "medium";
  readonly style?: CSSProperties;
}

/** MUI TextField の置換（単一行 input）。 */
export function TextField({
  value,
  onChange,
  size,
  disabled,
  style,
  className,
  ...rest
}: Readonly<TextFieldProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-textfield", className].filter(Boolean).join(" ");
  return (
    <input
      className={classes}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={style}
      {...rest}
    />
  );
}
