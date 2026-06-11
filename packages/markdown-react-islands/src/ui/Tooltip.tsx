"use client";

import { cloneElement, isValidElement, useCallback, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Placement } from "@floating-ui/dom";

import { assignRef, type ChildWithRef } from "./refs";
import { useFloating } from "./useFloating";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  title: ReactNode;
  placement?: Placement;
  children: ReactElement;
  /** 注: arrow は現状非対応（必要なら @floating-ui の arrow middleware で実装可能）。 */
}

/**
 * MUI Tooltip の置換（本番版）。`@floating-ui/dom` を直叩きして offset / flip / shift で
 * viewport 端でも見切れない配置を行い、autoUpdate でスクロール・リサイズに追従する。
 * hover / focus で開き、`role="tooltip"` と `aria-describedby` を張る。
 */
export function Tooltip({ title, placement = "bottom", children }: Readonly<TooltipProps>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { referenceRef, floatingRef, x, y, ready } = useFloating({ open, placement });

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  if (!isValidElement(children)) return children;

  const child = children as ChildWithRef;
  const childRef = child.ref;
  const childProps = child.props;

  const setReference = (node: HTMLElement | null) => {
    referenceRef.current = node;
    assignRef(childRef, node);
  };

  const enhanced = cloneElement(child, {
    ref: setReference,
    "aria-describedby": open ? id : (childProps["aria-describedby"] as string | undefined),
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show();
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      show();
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
    },
  } as Partial<Record<string, unknown>>);

  return (
    <>
      {enhanced}
      {open && typeof document !== "undefined" && createPortal(
        <div
          id={id}
          role="tooltip"
          ref={(node) => { floatingRef.current = node; }}
          className={styles.tooltip}
          style={{ left: x, top: y, visibility: ready ? "visible" : "hidden" }}
        >
          {title}
        </div>,
        document.body,
      )}
    </>
  );
}
