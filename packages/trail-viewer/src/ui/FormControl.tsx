import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface FormControlProps extends HTMLAttributes<HTMLDivElement> {
  readonly fullWidth?: boolean;
  readonly size?: "small" | "medium";
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI FormControl の置換。フォーム要素のコンテナ。 */
export function FormControl({
  fullWidth,
  size: _size,
  disabled: _disabled,
  error: _error,
  children,
  style,
  className,
  ...rest
}: Readonly<FormControlProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-form-control",
    fullWidth ? "trv-form-control--fullwidth" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} style={style} {...rest}>
      {children}
    </div>
  );
}
