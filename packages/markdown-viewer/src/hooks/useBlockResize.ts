import { useCallback, useRef, useState } from "react";

const MIN_WIDTH = 50;

interface UseBlockResizeOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  currentWidth: string | null | undefined;
}

interface UseBlockResizeReturn {
  resizing: boolean;
  resizeWidth: number | null;
  displayWidth: string | undefined;
  handleResizePointerDown: (e: React.PointerEvent) => void;
  handleResizePointerMove: (e: React.PointerEvent) => void;
  handleResizePointerUp: () => void;
}

/**
 * ブロック要素のリサイズグリップ用フック。
 * ドラッグで幅を変更し、node.attrs.width に保存する。
 */
export function useBlockResize({
  containerRef, updateAttributes, currentWidth,
}: UseBlockResizeOptions): UseBlockResizeReturn {
  const [resizing, setResizing] = useState(false);
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    startXRef.current = e.clientX;
    startWidthRef.current = container.getBoundingClientRect().width;
    setResizing(true);
    setResizeWidth(startWidthRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [containerRef]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing) return;
    const delta = e.clientX - startXRef.current;
    setResizeWidth(Math.max(MIN_WIDTH, Math.round(startWidthRef.current + delta)));
  }, [resizing]);

  const handleResizePointerUp = useCallback(() => {
    if (!resizing) return;
    setResizing(false);
    if (resizeWidth !== null) {
      updateAttributes({ width: `${resizeWidth}px` });
    }
    setResizeWidth(null);
  }, [resizing, resizeWidth, updateAttributes]);

  const displayWidth = resizeWidth === null ? currentWidth || undefined : `${resizeWidth}px`;

  return { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp };
}
