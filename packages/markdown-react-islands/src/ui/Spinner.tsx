"use client";

import type { CSSProperties } from "react";

import styles from "./Spinner.module.css";

export interface SpinnerProps {
  /** 直径(px)。既定 40（MUI CircularProgress 既定と同じ）。 */
  size?: number;
  /** primary=テーマ主色 / inherit=親の color を継承。 */
  color?: "primary" | "inherit";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

// MUI CircularProgress と同じ viewBox/thickness。viewBox "22 22 44 44" の中心は 22 + 44/2 = 44。
const SIZE = 44;
const VIEWBOX = `${SIZE / 2} ${SIZE / 2} ${SIZE} ${SIZE}`;
const CENTER = SIZE / 2 + SIZE / 2; // 44
const THICKNESS = 3.6;
const RADIUS = (SIZE - THICKNESS) / 2; // 20.2

/** MUI CircularProgress の置換（indeterminate）。SVG 円弧 + CSS keyframes で同じ見た目を再現。 */
export function Spinner({
  size = 40,
  color = "primary",
  className,
  style,
  "aria-label": ariaLabel,
}: Readonly<SpinnerProps>) {
  const classes = [styles.root, color === "inherit" ? styles.inherit : styles.primary, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      className={classes}
      style={{ width: size, height: size, ...style }}
    >
      <svg className={styles.svg} viewBox={VIEWBOX}>
        <circle
          className={styles.circle}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={THICKNESS}
        />
      </svg>
    </span>
  );
}
