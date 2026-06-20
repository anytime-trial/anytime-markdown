import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: "regular" | "dense";
  readonly disableGutters?: boolean;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI Toolbar の置換。水平フレックスコンテナ。 */
export function Toolbar({
  variant = "regular",
  disableGutters,
  children,
  style,
  className,
  sx,
  ...rest
}: Readonly<ToolbarProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-toolbar",
    variant === "dense" ? "trv-toolbar--dense" : "",
    disableGutters ? "trv-toolbar--no-gutters" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest}>
      {children}
    </div>
  );
}
