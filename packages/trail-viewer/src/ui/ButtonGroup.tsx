import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: "text" | "outlined" | "contained";
  readonly size?: "small" | "medium" | "large";
  readonly color?: string;
  readonly orientation?: "horizontal" | "vertical";
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
  return (
    <div className={classes} role="group" style={{ ...sxToStyle(sx), ...style }} {...rest}>
      {children}
    </div>
  );
}
