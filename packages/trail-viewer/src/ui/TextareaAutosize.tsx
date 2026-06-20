import type { ChangeEvent, CSSProperties, TextareaHTMLAttributes } from "react";
import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface TextareaAutosizeProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "rows"> {
  readonly value: string;
  readonly onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly minRows?: number;
  readonly maxRows?: number;
  readonly style?: CSSProperties;
  readonly sx?: Record<string, unknown>;
}

/**
 * MUI TextareaAutosize の置換。内容に応じて minRows〜maxRows の範囲で高さを自動調整する。
 * ref は実 textarea を指す（呼び出し側が selectionStart 等を使うため）。
 */
export const TextareaAutosize = forwardRef<HTMLTextAreaElement, Readonly<TextareaAutosizeProps>>(
  function TextareaAutosize(
    { value, onChange, minRows = 1, maxRows, style, className, sx, ...rest },
    ref,
  ) {
    injectTrailUiStyles();
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRef = useCallback(
      (node: HTMLTextAreaElement | null): void => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const resize = useCallback((): void => {
      const el = innerRef.current;
      if (!el) return;
      const cs = globalThis.getComputedStyle(el);
      const lineHeight = Number.parseFloat(cs.lineHeight) || 18;
      const paddingY = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
      const borderY =
        Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth);
      const extra = paddingY + borderY;
      el.style.height = "auto";
      let next = el.scrollHeight;
      const min = minRows * lineHeight + extra;
      if (next < min) next = min;
      if (maxRows) {
        const max = maxRows * lineHeight + extra;
        if (next > max) next = max;
      }
      el.style.height = `${next}px`;
    }, [minRows, maxRows]);

    useLayoutEffect(() => {
      resize();
    }, [value, resize]);

    const classes = ["trv-textarea", className].filter(Boolean).join(" ");
    return (
      <textarea
        ref={setRef}
        className={classes}
        value={value}
        onChange={onChange}
        rows={minRows}
        style={{ ...sxToStyle(sx), ...style }}
        {...rest}
      />
    );
  },
);
