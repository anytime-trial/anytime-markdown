import type { LabelHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** MUI FormLabel の置換。 */
export function FormLabel({
  error,
  children,
  className,
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
    <label className={classes} {...rest}>
      {children}
    </label>
  );
}
