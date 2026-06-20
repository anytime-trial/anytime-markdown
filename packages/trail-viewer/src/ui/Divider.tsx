import type { CSSProperties, HTMLAttributes } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  readonly orientation?: "horizontal" | "vertical";
  readonly flexItem?: boolean;
  readonly light?: boolean;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI Divider の置換。水平・垂直の区切り線。 */
export function Divider({
  orientation = "horizontal",
  flexItem,
  light: _light,
  className,
  sx,
  style,
  ...rest
}: Readonly<DividerProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-divider",
    orientation === "vertical" ? "trv-divider--vertical" : "",
    flexItem ? "trv-divider--flex" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <hr className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest} />;
}
