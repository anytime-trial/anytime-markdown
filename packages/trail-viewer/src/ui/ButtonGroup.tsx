import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: "text" | "outlined" | "contained";
  readonly size?: "small" | "medium" | "large";
  readonly color?: string;
  readonly orientation?: "horizontal" | "vertical";
  /** 親幅いっぱいに広げる（accept-and-apply: display を flex にし幅 100%）。 */
  readonly fullWidth?: boolean;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI ButtonGroup の置換。ボタンを連結したグループコンテナ。 */
export function ButtonGroup({
  variant: _variant,
  size: _size,
  color: _color,
  orientation = "horizontal",
  fullWidth = false,
  className,
  children,
  sx,
  style,
  ...rest
}: Readonly<ButtonGroupProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-button-group",
    orientation === "vertical" ? "trv-button-group--vertical" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const fullWidthStyle: CSSProperties = fullWidth
    ? { display: "flex", width: "100%" }
    : {};
  return (
    <div
      className={classes}
      role="group"
      style={{ ...fullWidthStyle, ...sxToStyle(sx), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
