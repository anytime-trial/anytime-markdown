import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export type TextVariant =
  | "body"
  | "body1"
  | "body2"
  | "caption"
  | "subtitle1"
  | "subtitle2"
  | "overline"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "inherit";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  readonly variant?: TextVariant;
  /** MUI 互換: "text.secondary" / "error" / "text.primary" を受ける。それ以外は inherit。 */
  readonly color?: "text.primary" | "text.secondary" | "error" | "inherit" | string;
  readonly noWrap?: boolean;
  readonly gutterBottom?: boolean;
  readonly align?: CSSProperties["textAlign"];
  readonly display?: CSSProperties["display"];
  readonly fontWeight?: CSSProperties["fontWeight"];
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
  /** MUI 互換: 無視して variant から決定した要素タグを使う。 */
  readonly component?: ElementType;
  readonly sx?: Record<string, unknown>;
}

const VARIANT_CLASS: Record<TextVariant, string> = {
  body: "trv-text",
  body1: "trv-text trv-text-body1",
  body2: "trv-text trv-text-body2",
  caption: "trv-text trv-text-caption",
  subtitle1: "trv-text trv-text-subtitle1",
  subtitle2: "trv-text trv-text-subtitle2",
  overline: "trv-text trv-text-overline",
  h1: "trv-text trv-text-h1",
  h2: "trv-text trv-text-h2",
  h3: "trv-text trv-text-h3",
  h4: "trv-text trv-text-h4",
  h5: "trv-text trv-text-h5",
  h6: "trv-text trv-text-h6",
  inherit: "trv-text",
};

const VARIANT_TAG: Partial<Record<TextVariant, string>> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
};

const COLOR_CLASS: Record<string, string> = {
  "text.secondary": "trv-text-secondary",
  error: "trv-text-error",
};

/** MUI Typography の置換。body / body1 / body2 / caption / subtitle1 / subtitle2 / overline / h1-h6 / inherit。 */
export function Text({
  variant = "body",
  color,
  noWrap,
  gutterBottom,
  align,
  display,
  fontWeight,
  className,
  style,
  children,
  component: _component,
  sx,
  ...rest
}: Readonly<TextProps>) {
  injectTrailUiStyles();
  const cls = [
    VARIANT_CLASS[variant],
    color ? (COLOR_CLASS[color] ?? "") : "",
    noWrap ? "trv-text-nowrap" : "",
    gutterBottom ? "trv-text-gutter" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const Tag = (VARIANT_TAG[variant] ?? "span") as "span";
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    ...(align ? { textAlign: align } : {}),
    ...(display ? { display } : {}),
    ...(noWrap ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
    ...(gutterBottom ? { marginBottom: "0.35em" } : {}),
    ...(fontWeight !== undefined ? { fontWeight } : {}),
    ...style,
  };
  return (
    <Tag className={cls} style={Object.keys(composed).length > 0 ? composed : undefined} {...(rest as HTMLAttributes<HTMLElement>)}>
      {children}
    </Tag>
  );
}

/** MUI Typography の別名エクスポート。 */
export const Typography = Text;
