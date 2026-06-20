import type { CSSProperties, LabelHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI FormLabel の置換。 */
export function FormLabel({
  error,
  children,
  className,
  sx,
  style,
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
    <label className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest}>
      {children}
    </label>
  );
}
