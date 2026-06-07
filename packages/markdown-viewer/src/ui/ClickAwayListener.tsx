import { cloneElement, isValidElement, useEffect, useRef } from "react";
import type { ReactElement } from "react";

import { assignRef, type ChildWithRef } from "./refs";

export interface ClickAwayListenerProps {
  onClickAway: (event: MouseEvent | TouchEvent) => void;
  /** ref を受け取れる単一の要素。 */
  children: ReactElement;
}

/**
 * MUI ClickAwayListener の置換。子要素の外側を click / touchend したとき onClickAway を呼ぶ。
 * リスナは effect で登録するため、パネルを開いたクリック自体は発火しない（MUI と同挙動）。
 */
export function ClickAwayListener({ onClickAway, children }: Readonly<ClickAwayListenerProps>) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const onClickAwayRef = useRef(onClickAway);
  onClickAwayRef.current = onClickAway;

  useEffect(() => {
    const handler = (event: MouseEvent | TouchEvent) => {
      const node = nodeRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        onClickAwayRef.current(event);
      }
    };
    document.addEventListener("click", handler);
    document.addEventListener("touchend", handler, { passive: true });
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("touchend", handler);
    };
  }, []);

  if (!isValidElement(children)) return children;
  const child = children as ChildWithRef;
  const childRef = child.ref;
  return cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      nodeRef.current = node;
      assignRef(childRef, node);
    },
  });
}
