"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  /** MUI spacing 単位（×8px の gap）。 */
  spacing?: number;
  alignItems?: CSSProperties["alignItems"];
  justifyContent?: CSSProperties["justifyContent"];
  children?: ReactNode;
}

/** MUI Stack の置換。flex コンテナ + gap。`style` は最後にマージされ上書き可能。 */
export function Stack({
  direction = "column",
  spacing = 0,
  alignItems,
  justifyContent,
  style,
  children,
  ...rest
}: Readonly<StackProps>) {
  const composedStyle: CSSProperties = {
    display: "flex",
    flexDirection: direction,
    gap: spacing ? spacing * 8 : undefined,
    alignItems,
    justifyContent,
    ...style,
  };
  return (
    <div style={composedStyle} {...rest}>
      {children}
    </div>
  );
}
