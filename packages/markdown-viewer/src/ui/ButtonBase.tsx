import { forwardRef } from "react";
import type { ElementType, HTMLAttributes, KeyboardEvent } from "react";

import styles from "./ButtonBase.module.css";

export interface ButtonBaseProps extends HTMLAttributes<HTMLElement> {
  /** レンダリングする要素。既定は button。非 button では role/tabIndex/キーボード起動を付与。 */
  component?: ElementType;
  disabled?: boolean;
}

/**
 * MUI ButtonBase の置換。最小リセット + フォーカス/キーボード起動。
 * component="div" など非 button のときは role="button" / tabIndex=0 を付け、
 * Enter / Space で click を発火する（MUI ButtonBase のアクセシビリティ挙動を再現）。
 * 見た目（hover/focus 色・枠線・レイアウト）は消費側 className が持つ。
 */
export const ButtonBase = forwardRef<HTMLElement, ButtonBaseProps>(function ButtonBase(
  { component: Component = "button", className, disabled, children, onKeyDown, ...rest },
  ref,
) {
  const isNativeButton = Component === "button";

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event);
    if (
      !isNativeButton &&
      !disabled &&
      !event.defaultPrevented &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).click();
    }
  };

  const a11yProps = isNativeButton
    ? { disabled }
    : {
        role: "button",
        tabIndex: disabled ? -1 : 0,
        "aria-disabled": disabled || undefined,
      };

  return (
    <Component
      ref={ref}
      className={[styles.root, className].filter(Boolean).join(" ")}
      onKeyDown={handleKeyDown}
      {...a11yProps}
      {...rest}
    >
      {children}
    </Component>
  );
});
