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

  // Refs for stable callback references
  const resizingRef = useRef(false);
  const resizeWidthRef = useRef<number | null>(null);
  const updateAttrsRef = useRef(updateAttributes);
  const onResizeEndRef = useRef(onResizeEnd);
  const widthRef = useRef(width);
  updateAttrsRef.current = updateAttributes;
  onResizeEndRef.current = onResizeEnd;
  widthRef.current = width;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    startXRef.current = e.clientX;
    startWidthRef.current = container.getBoundingClientRect().width;
    resizingRef.current = true;
    setResizing(true);
    setResizeWidth(startWidthRef.current);
    resizeWidthRef.current = startWidthRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const newWidth = Math.max(MIN_DIAGRAM_WIDTH, Math.round(startWidthRef.current + delta));
    resizeWidthRef.current = newWidth;
    setResizeWidth(newWidth);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    setResizing(false);
    if (resizeWidthRef.current !== null) {
      updateAttrsRef.current({ width: `${resizeWidthRef.current}px` });
      onResizeEndRef.current?.();
    }
    resizeWidthRef.current = null;
    setResizeWidth(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    const container = containerRef.current;
    if (!container) return;
    const currentWidth = (widthRef.current && parseInt(widthRef.current, 10)) || container.getBoundingClientRect().width;
    const delta = e.key === "ArrowRight" ? step : -step;
    const newWidth = Math.max(MIN_DIAGRAM_WIDTH, Math.round(currentWidth + delta));
    updateAttrsRef.current({ width: `${newWidth}px` });
    onResizeEndRef.current?.();
  }, []);

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
