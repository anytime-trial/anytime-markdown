import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface FormControlProps extends HTMLAttributes<HTMLElement> {
  readonly fullWidth?: boolean;
  readonly size?: "small" | "medium";
  readonly variant?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  /** MUI 互換: render as this element type instead of div. */
  readonly component?: ElementType;
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
  component: Tag = "div",
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag className={classes} style={composed} {...(rest as any)}>
      {children}
    </Tag>
  );
}
