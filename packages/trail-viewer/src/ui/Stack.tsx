import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  readonly direction?: "row" | "column" | "row-reverse" | "column-reverse";
  /** MUI spacing 互換。1 単位 = 8px の gap。 */
  readonly spacing?: number;
  readonly divider?: ReactNode;
  readonly alignItems?: CSSProperties["alignItems"];
  readonly justifyContent?: CSSProperties["justifyContent"];
  readonly flexWrap?: CSSProperties["flexWrap"];
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly sx?: Record<string, unknown>;
}

/** MUI Stack の最小置換。flex コンテナ。 */
export function Stack({
  direction = "column",
  spacing = 0,
  divider: _divider,
  alignItems,
  justifyContent,
  flexWrap,
  style,
  className,
  children,
  sx,
  ...rest
}: Readonly<StackProps>) {
  injectTrailUiStyles();
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    display: "flex",
    flexDirection: direction,
    gap: spacing ? `${spacing * 8}px` : undefined,
    alignItems,
    justifyContent,
    flexWrap,
    ...style,
  };
  return (
    <div className={className} style={composed} {...rest}>
      {children}
    </div>
  );
}
