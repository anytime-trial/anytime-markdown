import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface FormControlProps extends HTMLAttributes<HTMLDivElement> {
  readonly fullWidth?: boolean;
  readonly size?: "small" | "medium";
  readonly variant?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI FormControl の置換。フォーム要素のコンテナ。 */
export function FormControl({
  fullWidth,
  size: _size,
  variant: _variant,
  disabled: _disabled,
  error: _error,
  children,
  style,
  className,
  sx,
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
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };
  return (
    <div className={classes} style={composed} {...rest}>
      {children}
    </div>
  );
}
