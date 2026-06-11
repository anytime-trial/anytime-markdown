"use client";

import type { ChangeEvent, CSSProperties } from "react";

import styles from "./Slider.module.css";

export interface SliderProps {
  value: number;
  onChange?: (event: ChangeEvent<HTMLInputElement>, value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: "small" | "medium";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-valuetext"?: string;
}

/** MUI Slider（単一つまみ）の置換。native range + gradient track で rail/track/thumb を再現。 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  size = "medium",
  className,
  style,
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValueText,
}: Readonly<SliderProps>) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const classes = [styles.slider, size === "small" ? styles.small : styles.medium, className]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      type="range"
      className={classes}
      style={{ ["--slider-fill" as string]: `${fill}%`, ...style }}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      onChange={(e) => onChange?.(e, Number(e.target.value))}
    />
  );
}
