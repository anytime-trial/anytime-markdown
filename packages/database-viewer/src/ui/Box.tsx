import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** MUI Box の最小置換。`sx` は廃し、レイアウトは呼び出し側の `style` で表現する。 */
export const Box = forwardRef<HTMLDivElement, Readonly<BoxProps>>(function Box(
  { className, children, ...rest },
  ref,
) {
  injectDatabaseUiStyles();
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
});
