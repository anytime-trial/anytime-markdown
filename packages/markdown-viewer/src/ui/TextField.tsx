import { useId, useState } from "react";
import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  Ref,
} from "react";

import styles from "./TextField.module.css";

export interface TextFieldProps {
  label?: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onClick?: (event: MouseEvent) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  minRows?: number;
  maxRows?: number;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  fullWidth?: boolean;
  size?: "small" | "medium";
  helperText?: ReactNode;
  helperTextId?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** input/textarea へ直接渡す属性（aria-label 等）。 */
  inputProps?: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
  "aria-describedby"?: string;
}

/** MUI TextField(outlined) の置換。フローティングラベルは paper 地でボーダーを切り欠いて再現。 */
export function TextField({
  label,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  onClick,
  placeholder,
  type = "text",
  multiline = false,
  minRows,
  maxRows,
  required = false,
  error = false,
  disabled = false,
  autoFocus = false,
  fullWidth = false,
  size = "medium",
  helperText,
  helperTextId,
  inputRef,
  inputProps,
  className,
  style,
  "aria-describedby": ariaDescribedBy,
}: Readonly<TextFieldProps>) {
  const [focused, setFocused] = useState(false);
  const reactId = useId();
  const inputId = `tf-${reactId}`;
  const hasValue = value !== undefined ? value.length > 0 : undefined;
  const shrink = focused || !!placeholder || (hasValue ?? false);

  const rootClasses = [
    styles.root,
    size === "small" ? styles.small : styles.medium,
    fullWidth ? styles.fullWidth : null,
    focused ? styles.focused : null,
    error ? styles.error : null,
    disabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleFocus = (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFocused(false);
    onBlur?.(e);
  };

  const shared = {
    id: inputId,
    className: styles.input,
    value,
    defaultValue,
    placeholder,
    disabled,
    required,
    autoFocus,
    "aria-invalid": error || undefined,
    "aria-describedby": ariaDescribedBy ?? (helperText ? helperTextId : undefined),
    onChange: onChange as never,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown,
    onClick,
    ...inputProps,
  };

  return (
    <div className={rootClasses} style={style}>
      <div className={styles.inputWrap}>
        {label && (
          <label
            htmlFor={inputId}
            className={styles.label}
            data-shrink={shrink}
          >
            {label}
            {required && <span aria-hidden="true">&nbsp;*</span>}
          </label>
        )}
        {multiline ? (
          <textarea
            ref={inputRef as Ref<HTMLTextAreaElement>}
            rows={minRows}
            style={maxRows ? { maxHeight: `${maxRows * 1.4375}em` } : undefined}
            {...shared}
          />
        ) : (
          <input ref={inputRef as Ref<HTMLInputElement>} type={type} {...shared} />
        )}
      </div>
      {helperText && (
        <p id={helperTextId} className={styles.helper}>
          {helperText}
        </p>
      )}
    </div>
  );
}
