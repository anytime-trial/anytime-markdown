import { useCallback, useRef, useState } from "react";

const MIN_DIAGRAM_WIDTH = 100;

interface UseDiagramResizeOptions {
  width: string | null;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  onResizeEnd?: () => void;
}

export function useDiagramResize({ width, updateAttributes, onResizeEnd }: UseDiagramResizeOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    startXRef.current = e.clientX;
    startWidthRef.current = container.getBoundingClientRect().width;
    setResizing(true);
    setResizeWidth(startWidthRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing) return;
    const delta = e.clientX - startXRef.current;
    const newWidth = Math.max(MIN_DIAGRAM_WIDTH, Math.round(startWidthRef.current + delta));
    setResizeWidth(newWidth);
  }, [resizing]);

  const handlePointerUp = useCallback(() => {
    if (!resizing) return;
    setResizing(false);
    if (resizeWidth !== null) {
      updateAttributes({ width: `${resizeWidth}px` });
      onResizeEnd?.();
    }
    setResizeWidth(null);
  }, [resizing, resizeWidth, updateAttributes, onResizeEnd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    const container = containerRef.current;
    if (!container) return;
    const currentWidth = (width && parseInt(width, 10)) || container.getBoundingClientRect().width;
    const delta = e.key === "ArrowRight" ? step : -step;
    const newWidth = Math.max(MIN_DIAGRAM_WIDTH, Math.round(currentWidth + delta));
    updateAttributes({ width: `${newWidth}px` });
    onResizeEnd?.();
  }, [width, updateAttributes, onResizeEnd]);

  const displayWidth = resizeWidth !== null ? `${resizeWidth}px` : width || undefined;

  return {
    containerRef,
    resizing,
    resizeWidth,
    displayWidth,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    MIN_WIDTH: MIN_DIAGRAM_WIDTH,
  };
}
