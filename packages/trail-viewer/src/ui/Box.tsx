import type { CSSProperties, ElementType, HTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface BoxProps extends HTMLAttributes<HTMLElement> {
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
  /** Render as this element type instead of div. */
  readonly component?: ElementType;
  /** Spread onto element (e.g. for component="img"). */
  readonly src?: string;
  /** Spread onto element (e.g. for component="img"). */
  readonly alt?: string;
  /** Spread onto element (e.g. for component="svg"). */
  readonly viewBox?: string;
  /** Spread onto element (e.g. for component="svg"). */
  readonly fill?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI Box の最小置換。`sx` は sxToStyle で変換してスタイルに反映する。 */
export const Box = forwardRef(function Box(
  { className, children, component: Tag = "div", sx, style, src, alt, viewBox, fill, ...rest }: Readonly<BoxProps>,
  ref: Ref<HTMLElement>,
) {
  injectTrailUiStyles();
  const extraProps: Record<string, unknown> = {};
  if (src !== undefined) extraProps["src"] = src;
  if (alt !== undefined) extraProps["alt"] = alt;
  if (viewBox !== undefined) extraProps["viewBox"] = viewBox;
  if (fill !== undefined) extraProps["fill"] = fill;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className} style={{ ...sxToStyle(sx), ...style }} {...rest} {...extraProps}>
      {children}
    </Tag>
  );
});
