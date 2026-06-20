import type { LabelHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface InputLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly shrink?: boolean;
  readonly error?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** MUI InputLabel の置換。 */
export function InputLabel({
  shrink: _shrink,
  error: _error,
  children,
  className,
  ...rest
}: Readonly<InputLabelProps>) {
  injectTrailUiStyles();
  const classes = ["trv-input-label", className].filter(Boolean).join(" ");
  return (
    <label className={classes} {...rest}>
      {children}
    </label>
  );
}
