import { cloneElement, isValidElement, useCallback, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Tooltip.module.css";

type Placement = "top" | "bottom";

export interface TooltipProps {
  title: ReactNode;
  placement?: Placement;
  children: ReactElement;
}

interface Pos {
  left: number;
  top: number;
}

/**
 * MUI Tooltip の置換（PoC・依存フリー版）。
 * 本番は @floating-ui/react で flip/shift を入れる想定。PoC では offset のみの最小実装。
 */
export function Tooltip({ title, placement = "bottom", children }: Readonly<TooltipProps>) {
  const [pos, setPos] = useState<Pos | null>(null);
  const id = useId();
  const anchorRef = useRef<HTMLElement | null>(null);

  const show = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const gap = 6;
    setPos({
      left: r.left + r.width / 2,
      top: placement === "bottom" ? r.bottom + gap : r.top - gap,
    });
  }, [placement]);

  const hide = useCallback(() => setPos(null), []);

  if (!isValidElement(children)) return children;

  const child = children as ReactElement<Record<string, unknown>>;
  const enhanced = cloneElement(child, {
    "aria-describedby": pos ? id : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      anchorRef.current = e.currentTarget;
      show(e.currentTarget);
      (child.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      (child.props.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      show(e.currentTarget);
      (child.props.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      (child.props.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
    },
  });

  return (
    <>
      {enhanced}
      {pos && typeof document !== "undefined" && createPortal(
        <div
          id={id}
          role="tooltip"
          className={styles.tooltip}
          style={{ left: pos.left, top: pos.top, transform: placement === "bottom" ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}
        >
          {title}
        </div>,
        document.body,
      )}
    </>
  );
}
