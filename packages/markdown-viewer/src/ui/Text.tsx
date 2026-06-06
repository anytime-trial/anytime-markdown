import type { ElementType, HTMLAttributes, ReactNode } from "react";

import styles from "./Text.module.css";

type Variant = "h6" | "subtitle1" | "subtitle2" | "body1" | "body2" | "caption";

/** MUI Typography の variantMapping に準拠した既定要素。 */
const VARIANT_ELEMENT: Record<Variant, ElementType> = {
  h6: "h6",
  subtitle1: "h6",
  subtitle2: "h6",
  body1: "p",
  body2: "p",
  caption: "span",
};

export interface TextProps extends HTMLAttributes<HTMLElement> {
  variant?: Variant;
  /** 描画要素の上書き（MUI Typography の component prop 相当）。 */
  component?: ElementType;
  gutterBottom?: boolean;
  noWrap?: boolean;
  children?: ReactNode;
}

/**
 * MUI Typography の置換（chrome 脱 MUI 用）。色は指定せず inherit（MUI 同様）。
 * 太字や色は `style` / `className` で呼び出し側が付与する。
 */
export function Text({
  variant = "body1",
  component,
  gutterBottom,
  noWrap,
  className,
  children,
  ...rest
}: Readonly<TextProps>) {
  const Comp = component ?? VARIANT_ELEMENT[variant];
  const classes = [
    styles.root,
    styles[variant],
    gutterBottom ? styles.gutterBottom : null,
    noWrap ? styles.noWrap : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Comp className={classes} {...rest}>
      {children}
    </Comp>
  );
}
