import type { CSSProperties, LabelHTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface InputLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly shrink?: boolean;
  readonly error?: boolean;
  readonly size?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI InputLabel の置換。 */
export function InputLabel({
  shrink,
  error: _error,
  size: _size,
  children,
  className,
  sx,
  style,
  ...rest
}: Readonly<InputLabelProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-input-label",
    shrink ? "trv-input-label--shrink" : "",
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
