import type { ButtonHTMLAttributes, ElementType, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children?: ReactNode;
  /** MUI 互換: button 以外の要素タグ。リンク用途などで使用。無視して常に button を描画する。 */
  readonly component?: ElementType;
}

/** MUI ButtonBase の置換。リセットスタイル付きの基本ボタン。 */
export function ButtonBase({
  className,
  children,
  type = "button",
  component: _component,
  ...rest
}: Readonly<ButtonBaseProps>) {
  injectTrailUiStyles();
  const classes = ["trv-btn-base", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
