import type { HTMLAttributes } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  readonly orientation?: "horizontal" | "vertical";
  readonly flexItem?: boolean;
}

/** MUI Divider の置換。水平・垂直の区切り線。 */
export function Divider({
  orientation = "horizontal",
  flexItem,
  className,
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
  return <hr className={classes} {...rest} />;
}
