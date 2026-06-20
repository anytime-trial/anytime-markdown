import type { CSSProperties } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface CircularProgressProps {
  readonly size?: number;
  readonly thickness?: number;
  readonly color?: "primary" | "inherit";
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI CircularProgress の置換。SVG ベースの CSS スピナー。 */
export function CircularProgress({
  size = 40,
  thickness = 3.6,
  color: _color,
  style,
  className,
  sx,
}: Readonly<CircularProgressProps>) {
  injectTrailUiStyles();
  const classes = ["trv-circular-progress", className].filter(Boolean).join(" ");
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * 0.75; // ~75% arc

  return (
    <span className={classes} style={{ ...sxToStyle(sx), width: size, height: size, ...style }}>
      <svg viewBox={`${size / 2} ${size / 2} ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size}
          cy={size}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
