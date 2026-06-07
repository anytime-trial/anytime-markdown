import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

export interface TextProps extends HTMLAttributes<HTMLSpanElement> {
  /** 現状 caption のみ使用。 */
  readonly variant?: "caption";
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** MUI Typography(variant="caption") の置換。 */
export function Text({ variant = "caption", className, children, ...rest }: Readonly<TextProps>) {
  injectSpreadsheetUiStyles();
  const cls = [variant === "caption" ? "sv-text-caption" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
