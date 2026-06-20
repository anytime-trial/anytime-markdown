import type { ButtonHTMLAttributes, CSSProperties, ElementType, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children?: ReactNode;
  /** MUI 互換: button 以外の要素タグ。リンク用途などで使用。無視して常に button を描画する。 */
  readonly component?: ElementType;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI ButtonBase の置換。リセットスタイル付きの基本ボタン。 */
export function ButtonBase({
  className,
  children,
  type = "button",
  component: _component,
  sx,
  style,
  ...rest
}: Readonly<ButtonBaseProps>) {
  injectTrailUiStyles();
  const classes = ["trv-btn-base", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest}>
      {children}
    </button>
  );
}
