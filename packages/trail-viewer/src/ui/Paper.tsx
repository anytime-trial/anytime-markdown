import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface PaperProps extends HTMLAttributes<HTMLDivElement> {
  readonly elevation?: 0 | 1 | 2;
  readonly variant?: "elevation" | "outlined";
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI Paper の置換。背景・影付きのサーフェスコンテナ。 */
export const Paper = forwardRef<HTMLDivElement, Readonly<PaperProps>>(function Paper(
  { elevation = 1, variant = "elevation", className, children, ...rest },
  ref,
) {
  injectTrailUiStyles();
  const classes = [
    "trv-paper",
    variant === "outlined" ? "trv-paper--outlined" : `trv-paper--elevation${elevation}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});
