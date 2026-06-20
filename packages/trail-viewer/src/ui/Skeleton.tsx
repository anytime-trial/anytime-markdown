import type { CSSProperties } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface SkeletonProps {
  readonly variant?: "text" | "circular" | "rectangular" | "rounded";
  readonly width?: number | string;
  readonly height?: number | string;
  readonly animation?: "pulse" | "wave" | false;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI Skeleton の置換。ローディングプレースホルダー。 */
export function Skeleton({
  variant = "text",
  width,
  height,
  animation = "pulse",
  style,
  className,
  sx,
}: Readonly<SkeletonProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-skeleton",
    variant === "text" ? "trv-skeleton--text" : "",
    variant === "circular" ? "trv-skeleton--circular" : "",
    variant === "rectangular" ? "trv-skeleton--rectangular" : "",
    animation === false ? "trv-skeleton--no-animation" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    width: width !== undefined ? width : "100%",
    height: height !== undefined ? height : undefined,
    ...style,
  };
  return <span className={classes} style={composed} />;
}
