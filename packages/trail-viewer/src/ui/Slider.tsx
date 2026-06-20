import type { ChangeEvent, CSSProperties } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface SliderProps {
  readonly value: number;
  readonly onChange: (e: ChangeEvent<HTMLInputElement>, value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly marks?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly name?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI Slider の置換。input[type=range] ベース。 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  marks: _marks,
  style,
  className,
  name,
  sx,
}: Readonly<SliderProps>) {
  injectTrailUiStyles();
  const classes = ["trv-slider", className].filter(Boolean).join(" ");
  return (
    <input
      type="range"
      className={classes}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      name={name}
      style={{ ...sxToStyle(sx), ...style }}
      onChange={(e) => onChange(e, Number(e.target.value))}
    />
  );
}
