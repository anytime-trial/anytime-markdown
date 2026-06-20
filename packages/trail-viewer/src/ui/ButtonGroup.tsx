import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: "text" | "outlined" | "contained";
  readonly size?: "small" | "medium" | "large";
  readonly orientation?: "horizontal" | "vertical";
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI ButtonGroup の置換。ボタンを連結したグループコンテナ。 */
export function ButtonGroup({
  variant: _variant,
  size: _size,
  orientation = "horizontal",
  className,
  children,
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
    <div className={classes} role="group" {...rest}>
      {children}
    </div>
  );
}
