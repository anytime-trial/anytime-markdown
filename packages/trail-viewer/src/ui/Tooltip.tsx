import type { CSSProperties, ReactElement, ReactNode } from "react";
import { cloneElement, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface TooltipProps {
  readonly title: ReactNode;
  readonly children: ReactElement;
  readonly placement?: "top" | "bottom" | "left" | "right" | string;
  readonly arrow?: boolean;
  /** MUI 互換: accept-and-ignore */
  readonly slotProps?: Record<string, unknown>;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/**
 * MUI Tooltip の置換。hover / focus で子要素の上に表示する。
 *
 * MUI Tooltip 同様、Tooltip 自身が知らない余剰プロップ（例: ToggleButtonGroup / Tabs が
 * `cloneElement` で注入する `selected` / `onChange` / `size`）は唯一の子要素へ転送する。
 * これがないと `<ToggleButtonGroup><Tooltip><ToggleButton/></Tooltip></ToggleButtonGroup>` の
 * 構成で onChange/selected が ToggleButton に届かず、切替が無反応になる。
 */
export function Tooltip({
  title,
  children,
  placement: _placement,
  arrow: _arrow,
  slotProps: _slotProps,
  sx,
  style,
  ...forwarded
}: Readonly<TooltipProps> & Record<string, unknown>) {
  injectTrailUiStyles();
  const child =
    Object.keys(forwarded).length > 0
      ? cloneElement(children, forwarded)
      : children;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const show = (): void => {
    if (!title) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setCoords({ top: r.top - 6, left: r.left + r.width / 2 });
  };
  const hide = (): void => setCoords(null);

  return (
    <span
      ref={wrapRef}
      style={{ display: "inline-flex", ...sxToStyle(sx), ...style }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {child}
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="trv-tooltip"
            role="tooltip"
            style={{ top: coords.top, left: coords.left, transform: "translate(-50%, -100%)" }}
          >
            {title}
          </div>,
          document.body,
        )}
    </span>
  );
}
