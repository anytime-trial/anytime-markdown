import type { ChangeEvent, CSSProperties, SyntheticEvent } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface SliderProps {
  readonly value: number;
  readonly onChange: (e: ChangeEvent<HTMLInputElement> | Event | SyntheticEvent, value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium" | string;
  readonly marks?: boolean;
  /** MUI 互換: accept-and-ignore */
  readonly valueLabelDisplay?: "auto" | "on" | "off";
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly name?: string;
  readonly "aria-label"?: string;
  readonly "aria-valuetext"?: string;
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
  size: _size,
  marks: _marks,
  valueLabelDisplay: _valueLabelDisplay,
  style,
  className,
  name,
  sx,
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValuetext,
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
      aria-label={ariaLabel}
      aria-valuetext={ariaValuetext}
      style={{ ...sxToStyle(sx), ...style }}
      onChange={(e) => onChange(e, Number(e.target.value))}
    />
  );
}
