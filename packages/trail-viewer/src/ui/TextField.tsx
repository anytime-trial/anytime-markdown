import type {
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import { Children, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { MenuItemProps } from "./MenuItem";
import { sxToStyle } from "./sx";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  readonly value?: string | number;
  readonly onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly size?: "small" | "medium";
  readonly label?: string;
  readonly placeholder?: string;
  readonly fullWidth?: boolean;
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly minRows?: number;
  readonly maxRows?: number;
  readonly type?: string;
  readonly style?: CSSProperties;
  readonly error?: boolean;
  readonly helperText?: ReactNode;
  /** MUI TextField select: true → children を <select> 要素でラップして表示 */
  readonly select?: boolean;
  readonly children?: ReactNode;
  readonly inputProps?: InputHTMLAttributes<HTMLInputElement>;
  /** accepted for MUI compatibility; not visually wired */
  readonly InputProps?: Record<string, unknown>;
  /** accepted for MUI compatibility; not visually wired */
  readonly slotProps?: Record<string, unknown>;
  readonly sx?: Record<string, unknown>;
}

/** MUI TextField の置換（単一行 input / select）。 */
export function TextField({
  value,
  onChange,
  size: _size,
  label,
  fullWidth,
  multiline: _multiline,
  rows: _rows,
  minRows: _minRows,
  maxRows: _maxRows,
  disabled,
  style,
  className,
  error,
  helperText,
  select,
  children,
  inputProps,
  InputProps: _InputProps, // accepted for MUI compatibility; not visually wired
  slotProps: _slotProps, // accepted for MUI compatibility; not visually wired
  sx,
  ...rest
}: Readonly<TextFieldProps>) {
  injectTrailUiStyles();
  const classes = ["trv-textfield", error ? "trv-textfield--error" : "", className]
    .filter(Boolean)
    .join(" ");
  const wrapStyle: CSSProperties = {
    ...sxToStyle(sx),
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };
  const inputStyle: CSSProperties = {
    ...(error ? { borderColor: "var(--trv-color-error-main)" } : {}),
  };

  // select=true: MUI compound select pattern — render as <select>. children は MenuItem の
  // value / children から <option> へ変換する（<select> は <button> を子に持てないため必須）。
  if (select) {
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
    const selectEl = (
      <select
        className={classes}
        value={value}
        disabled={disabled}
        onChange={onChange as unknown as (e: ChangeEvent<HTMLSelectElement>) => void}
        style={{ ...inputStyle, ...(fullWidth ? { width: "100%" } : {}) }}
      >
        {options}
      </select>
    );
    if (label || helperText) {
      return (
        <div style={{ display: "flex", flexDirection: "column", ...wrapStyle }}>
          {label && <label className="trv-input-label">{label}</label>}
          {selectEl}
          {helperText && (
            <span style={{ fontSize: "0.75rem", color: error ? "var(--trv-color-error-main)" : "var(--trv-color-text-secondary)", marginTop: "3px" }}>
              {helperText}
            </span>
          )}
        </div>
      );
    }
    return <div style={wrapStyle}>{selectEl}</div>;
  }

  const inputEl = (
    <input
      className={classes}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={{ ...inputStyle, ...(fullWidth ? { width: "100%" } : {}) }}
      {...inputProps}
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
    />
  );

  if (label || helperText) {
    return (
      <div style={{ display: "flex", flexDirection: "column", ...wrapStyle }}>
        {label && <label className="trv-input-label">{label}</label>}
        {inputEl}
        {helperText && (
          <span style={{ fontSize: "0.75rem", color: error ? "var(--trv-color-error-main)" : "var(--trv-color-text-secondary)", marginTop: "3px" }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }

  return (
    <input
      className={classes}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={{ ...inputStyle, ...wrapStyle }}
      {...inputProps}
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
    />
  );
}
