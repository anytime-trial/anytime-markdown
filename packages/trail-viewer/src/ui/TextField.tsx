import type { ChangeEvent, CSSProperties, InputHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  readonly value?: string | number;
  readonly onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly size?: "small" | "medium";
  readonly label?: string;
  readonly placeholder?: string;
  readonly fullWidth?: boolean;
  readonly style?: CSSProperties;
  readonly inputProps?: InputHTMLAttributes<HTMLInputElement>;
  readonly InputProps?: {
    readonly startAdornment?: ReactNode;
    readonly endAdornment?: ReactNode;
  };
}

/** MUI TextField の置換（単一行 input）。 */
export function TextField({
  value,
  onChange,
  size: _size,
  label,
  fullWidth,
  disabled,
  style,
  className,
  inputProps,
  InputProps,
  ...rest
}: Readonly<TextFieldProps>) {
  injectTrailUiStyles();
  const classes = ["trv-textfield", className].filter(Boolean).join(" ");
  const wrapStyle: CSSProperties = fullWidth ? { width: "100%", ...style } : (style ?? {});

  if (label || InputProps?.startAdornment || InputProps?.endAdornment) {
    return (
      <div style={{ display: "flex", flexDirection: "column", ...wrapStyle }}>
        {label && <label className="trv-input-label">{label}</label>}
        <div style={{ display: "flex", alignItems: "center" }}>
          {InputProps?.startAdornment}
          <input
            className={classes}
            value={value}
            disabled={disabled}
            onChange={onChange}
            style={fullWidth ? { flex: 1 } : undefined}
            {...inputProps}
            {...rest}
          />
          {InputProps?.endAdornment}
        </div>
      </div>
    );
  }

  return (
    <input
      className={classes}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={wrapStyle}
      {...inputProps}
      {...rest}
    />
  );
}
