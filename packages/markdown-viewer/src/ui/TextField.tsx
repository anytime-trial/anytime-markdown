import { useId } from "react";
import type {
  ChangeEvent,
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
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
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

// MUI TextField のデフォルト line-height（maxRows の高さ算出に使用）。
const LINE_HEIGHT = 1.4375;

/** MUI TextField(outlined) の置換。フローティングラベルは paper 地でボーダーを切り欠いて再現。
 *  フォーカス状態は CSS `:focus-within` で扱う（state レス）。 */
export function TextField({
  label,
  value,
  onChange,
  onBlur,
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
  const inputId = `tf-${useId()}`;
  // 値・placeholder があるときは常に shrink。フォーカス時の shrink は CSS が担う。
  const shrink = !!placeholder || (value !== undefined && value.length > 0);

  const rootClasses = [
    styles.root,
    size === "small" ? styles.small : styles.medium,
    fullWidth ? styles.fullWidth : null,
    error ? styles.error : null,
    disabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const shared = {
    id: inputId,
    className: styles.input,
    value,
    placeholder,
    disabled,
    required,
    autoFocus,
    "aria-invalid": error || undefined,
    "aria-describedby": ariaDescribedBy ?? (helperText ? helperTextId : undefined),
    onChange,
    onBlur,
    onKeyDown,
    onClick,
    ...inputProps,
  };

  return (
    <div className={rootClasses} style={style}>
      <div className={styles.inputWrap}>
        {label && (
          <label htmlFor={inputId} className={styles.label} data-shrink={shrink}>
            {label}
            {required && <span aria-hidden="true">&nbsp;*</span>}
          </label>
        )}
        {multiline ? (
          <textarea
            ref={inputRef as Ref<HTMLTextAreaElement>}
            rows={minRows}
            style={maxRows ? { maxHeight: `${maxRows * LINE_HEIGHT}em` } : undefined}
            {...shared}
          />
        ) : (
          <input ref={inputRef} type={type} {...shared} />
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
