import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
  /** MUI 互換: 無視して常に div を描画する。 */
  readonly component?: ElementType;
  readonly sx?: Record<string, unknown>;
}

/** MUI Box の最小置換。`sx` は sxToStyle で変換してスタイルに反映する。 */
export const Box = forwardRef<HTMLDivElement, Readonly<BoxProps>>(function Box(
  { className, children, component: _component, sx, style, ...rest },
  ref,
) {
  injectTrailUiStyles();
  return (
    <div ref={ref} className={className} style={{ ...sxToStyle(sx), ...style }} {...rest}>
      {children}
    </div>
  );
});
