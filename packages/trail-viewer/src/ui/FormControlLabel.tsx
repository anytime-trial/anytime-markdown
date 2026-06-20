import type { ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface FormControlLabelProps {
  readonly label: ReactNode;
  readonly control: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly labelPlacement?: "end" | "start" | "top" | "bottom";
}

/** MUI FormControlLabel の置換。チェックボックス・ラジオ等にラベルを付ける。 */
export function FormControlLabel({
  label,
  control,
  disabled,
  className,
  labelPlacement = "end",
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
    <label className={classes} style={{ flexDirection: isReverse ? "row-reverse" : "row" }}>
      {control}
      <span>{label}</span>
    </label>
  );
}
