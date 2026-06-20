import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: "small" | "medium" | "large";
  readonly color?: "inherit" | "primary" | "default" | string;
  readonly edge?: string;
  readonly children?: ReactNode;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI IconButton の置換。円形ホバー背景・disabled 半透明。 */
export function IconButton({
  size = "medium",
  color: _color,
  edge: _edge,
  title,
  className,
  children,
  type = "button",
  sx,
  style,
  ...rest
}: Readonly<IconButtonProps>) {
  injectTrailUiStyles();
  const classes = ["trv-icon-btn", size === "small" ? "trv-icon-btn--small" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      className={classes}
      title={title}
      aria-label={title}
      style={{ ...sxToStyle(sx), ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
