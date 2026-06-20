import type { CSSProperties } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface LinearProgressProps {
  readonly variant?: "indeterminate" | "determinate" | "buffer";
  readonly value?: number;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI LinearProgress の置換。水平プログレスバー。 */
export function LinearProgress({
  variant = "indeterminate",
  value = 0,
  style,
  className,
  sx,
}: Readonly<LinearProgressProps>) {
  injectTrailUiStyles();
  const classes = ["trv-linear-progress", className].filter(Boolean).join(" ");
  const isDeterminate = variant === "determinate";
  const barStyle: CSSProperties = isDeterminate
    ? { transform: `scaleX(${value / 100})`, width: "100%" }
    : {};

  return (
    <div
      className={classes}
      role="progressbar"
      aria-valuenow={isDeterminate ? value : undefined}
      style={{ ...sxToStyle(sx), ...style }}
    >
      {isDeterminate ? (
        <div className="trv-linear-progress-bar" style={barStyle} />
      ) : (
        <>
          <div className="trv-linear-progress-bar trv-linear-progress-bar--indeterminate1" />
          <div className="trv-linear-progress-bar trv-linear-progress-bar--indeterminate2" />
        </>
      )}
    </div>
  );
}
