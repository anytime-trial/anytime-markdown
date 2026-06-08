import type { CSSProperties } from "react";

import styles from "./ProgressBar.module.css";

export interface ProgressBarProps {
  variant?: "determinate" | "indeterminate";
  /** determinate 時の進捗（0–100）。 */
  value?: number;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

/** MUI LinearProgress の置換。determinate（value%）と indeterminate に対応。 */
export function ProgressBar({
  variant = "indeterminate",
  value = 0,
  className,
  style,
  "aria-label": ariaLabel,
}: Readonly<ProgressBarProps>) {
  const determinate = variant === "determinate";
  const classes = [styles.root, className].filter(Boolean).join(" ");
  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={determinate ? Math.round(value) : undefined}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      className={classes}
      style={style}
    >
      <span
        className={`${styles.bar} ${determinate ? styles.determinate : styles.indeterminate}`}
        style={determinate ? { transform: `translateX(${value - 100}%)` } : undefined}
      />
    </span>
  );
}
