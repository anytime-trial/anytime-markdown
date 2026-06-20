import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface FormControlLabelProps {
  readonly label: ReactNode;
  readonly control: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly labelPlacement?: "end" | "start" | "top" | "bottom";
  /** MUI 互換: RadioGroup 内で値として使われる。 */
  readonly value?: unknown;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI FormControlLabel の置換。チェックボックス・ラジオ等にラベルを付ける。 */
export function FormControlLabel({
  label,
  control,
  disabled,
  className,
  labelPlacement = "end",
  value: _value,
  sx,
  style,
}: Readonly<FormControlLabelProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-form-control-label",
    disabled ? "trv-form-control-label--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const isReverse = labelPlacement === "start";
  return (
    <label
      className={classes}
      style={{ ...sxToStyle(sx), flexDirection: isReverse ? "row-reverse" : "row", ...style }}
    >
      {control}
      <span>{label}</span>
    </label>
  );
}
