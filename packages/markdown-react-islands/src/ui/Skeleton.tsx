"use client";

import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  variant?: "text" | "rectangular" | "circular";
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** MUI Skeleton の置換（pulse アニメーション）。 */
export function Skeleton({
  variant = "rectangular",
  width,
  height,
  className,
  style,
}: Readonly<SkeletonProps>) {
  const classes = [styles.root, styles[variant], className].filter(Boolean).join(" ");
  return <span className={classes} style={{ width, height, ...style }} />;
}
