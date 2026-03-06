import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/** Find the first scrollable child element (BFS) */
function findScrollableChild(container: HTMLElement): HTMLElement | null {
  const queue: HTMLElement[] = [container];
  while (queue.length > 0) {
    const el = queue.shift();
    if (!el) continue;
    if (el.scrollHeight > el.clientHeight + 1) {
      const style = getComputedStyle(el);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        return el;
      }
    }
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) queue.push(child);
    }
  }
  return null;
}

export function useScrollSync(
  leftContainerRef: RefObject<HTMLDivElement | null>,
  rightScrollRef: RefObject<HTMLDivElement | null>,
): void {
  const isSyncingScroll = useRef(false);

  // Left -> Right scroll sync (capture phase)
  useEffect(() => {
    const container = leftContainerRef.current;
    if (!container) return;
    const handleScroll = (e: Event) => {
      if (isSyncingScroll.current) return;
      const target = e.target as HTMLElement;
      if (!target || !container.contains(target)) return;
      isSyncingScroll.current = true;
      requestAnimationFrame(() => {
        const right = rightScrollRef.current;
        if (right) {
          const maxLeft = target.scrollHeight - target.clientHeight;
          const ratio = maxLeft > 0 ? target.scrollTop / maxLeft : 0;
          right.scrollTop = ratio * (right.scrollHeight - right.clientHeight);
        }
        isSyncingScroll.current = false;
      });
    };
    container.addEventListener("scroll", handleScroll, true);
    return () => container.removeEventListener("scroll", handleScroll, true);
  }, [leftContainerRef, rightScrollRef]);

  // Right -> Left scroll sync
  useEffect(() => {
    const right = rightScrollRef.current;
    if (!right) return;
    const handleScroll = () => {
      if (isSyncingScroll.current) return;
      const container = leftContainerRef.current;
      if (!container) return;
      isSyncingScroll.current = true;
      requestAnimationFrame(() => {
        const scrollable = findScrollableChild(container);
        if (scrollable) {
          const maxRight = right.scrollHeight - right.clientHeight;
          const ratio = maxRight > 0 ? right.scrollTop / maxRight : 0;
          scrollable.scrollTop = ratio * (scrollable.scrollHeight - scrollable.clientHeight);
        }
        isSyncingScroll.current = false;
      });
    };
    right.addEventListener("scroll", handleScroll);
    return () => right.removeEventListener("scroll", handleScroll);
  }, [leftContainerRef, rightScrollRef]);
}
