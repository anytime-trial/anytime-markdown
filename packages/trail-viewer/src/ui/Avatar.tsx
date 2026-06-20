import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface AvatarProps {
  readonly src?: string;
  readonly alt?: string;
  readonly children?: ReactNode;
  readonly variant?: "circular" | "rounded" | "square";
  readonly size?: "small" | "medium" | "large";
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI Avatar の置換。画像・イニシャル・アイコンを丸枠で表示する。 */
export function Avatar({
  src,
  alt,
  children,
  variant = "circular",
  size = "medium",
  style,
  className,
}: Readonly<AvatarProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-avatar",
    size === "small" ? "trv-avatar--small" : "",
    size === "large" ? "trv-avatar--large" : "",
    variant === "rounded" ? "trv-avatar--rounded" : "",
    variant === "square" ? "trv-avatar--square" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} style={style} aria-label={alt}>
      {src ? <img src={src} alt={alt} /> : children}
    </span>
  );
}
