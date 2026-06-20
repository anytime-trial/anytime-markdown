import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface FormLabelProps extends HTMLAttributes<HTMLElement> {
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
  /** MUI 互換: render as this element type instead of label. */
  readonly component?: ElementType;
}

/** MUI FormLabel の置換。 */
export function FormLabel({
  error,
  children,
  className,
  sx,
  style,
  component: Tag = "label",
  ...rest
}: Readonly<FormLabelProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-form-label",
    error ? "trv-form-label--error" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag className={classes} style={{ ...sxToStyle(sx), ...style }} {...(rest as any)}>
      {children}
    </Tag>
  );
}
