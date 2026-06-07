import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export type TextVariant = "body" | "caption" | "subtitle2";

export interface TextProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: TextVariant;
  /** MUI 互換: "text.secondary" / "error" を受ける。それ以外は inherit。 */
  readonly color?: "text.secondary" | "error" | "inherit";
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
}

const VARIANT_CLASS: Record<TextVariant, string> = {
  body: "dbv-text",
  caption: "dbv-text dbv-text-caption",
  subtitle2: "dbv-text dbv-text-subtitle2",
};

const COLOR_CLASS: Record<string, string> = {
  "text.secondary": "dbv-text-secondary",
  error: "dbv-text-error",
};

/** MUI Typography の置換（body / caption / subtitle2）。 */
export function Text({
  variant = "body",
  color,
  className,
  children,
  ...rest
}: Readonly<TextProps>) {
  injectDatabaseUiStyles();
  const cls = [VARIANT_CLASS[variant], color ? COLOR_CLASS[color] : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
