import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { injectSpreadsheetUiStyles } from "./injectStyles";

export interface TooltipProps {
  readonly title: string;
  /** 現状 top のみ使用。 */
  readonly placement?: "top";
  readonly children: ReactElement;
}

/** MUI Tooltip の置換。hover / focus で子要素の上に表示する。 */
export function Tooltip({ title, children }: Readonly<TooltipProps>) {
  injectSpreadsheetUiStyles();
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
      style={{ display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="sv-tooltip"
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
