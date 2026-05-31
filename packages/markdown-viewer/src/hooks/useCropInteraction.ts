import React, { useCallback, useState } from "react";

import {
  applyDrawing, applyMoving, applyResizing,
  computeHitTest,
  type CropRect, type DragMode, type ResizeHandle,
} from "../utils/cropGeometry";

const EDGE_THRESHOLD = 0.02; // 2% of image for edge detection

interface UseCropInteractionParams {
  cropping: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
}

interface UseCropInteractionReturn {
  cropRect: CropRect | null;
  setCropRect: (rect: CropRect | null) => void;
  drawing: boolean;
  hoverCursor: string;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  resetInteraction: () => void;
}

export function useCropInteraction({
  cropping, imgRef,
}: Readonly<UseCropInteractionParams>): UseCropInteractionReturn {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [startRect, setStartRect] = useState<CropRect | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string>("crosshair");

  const getRelativePos = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, [imgRef]);

  /** cropRect の端・内部・外部を判定 */
  const hitTest = useCallback((pos: { x: number; y: number }, cr: CropRect) => {
    return computeHitTest(pos, cr, EDGE_THRESHOLD);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!cropping) return;
    const pos = getRelativePos(e);
    if (!pos) return;

    if (cropRect && cropRect.width > 0.01 && cropRect.height > 0.01) {
      const hit = hitTest(pos, cropRect);
      if (hit.mode === "moving") {
        setDragMode("moving");
        setStartPos(pos);
        setStartRect({ ...cropRect });
        return;
      }
      if (hit.mode === "resizing") {
        setDragMode("resizing");
        setResizeHandle(hit.handle);
        setStartPos(pos);
        setStartRect({ ...cropRect });
        return;
      }
    }
    // New drawing
    setDragMode("drawing");
    setStartPos(pos);
    setCropRect(null);
  }, [cropping, cropRect, getRelativePos, hitTest]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getRelativePos(e);
    if (!pos) return;

    // Update cursor on hover
    if (dragMode === "none" && cropping && cropRect && cropRect.width > 0.01 && cropRect.height > 0.01) {
      const hit = hitTest(pos, cropRect);
      setHoverCursor(hit.cursor);
    }

    if (dragMode === "none" || !startPos) return;

    if (dragMode === "drawing") {
      setCropRect(applyDrawing(startPos, pos));
    } else if (dragMode === "moving" && startRect) {
      setCropRect(applyMoving(startPos, pos, startRect));
    } else if (dragMode === "resizing" && startRect && resizeHandle) {
      setCropRect(applyResizing(startPos, pos, startRect, resizeHandle));
    }
  }, [dragMode, startPos, startRect, resizeHandle, getRelativePos, cropping, cropRect, hitTest]);

  const handleMouseUp = useCallback(() => {
    setDragMode("none");
    setResizeHandle(null);
    setStartRect(null);
  }, []);

  const drawing = dragMode !== "none";

  const resetInteraction = useCallback(() => {
    setCropRect(null);
    setDragMode("none");
    setResizeHandle(null);
    setStartRect(null);
    setHoverCursor("crosshair");
  }, []);

  return {
    cropRect, setCropRect,
    drawing, hoverCursor,
    handleMouseDown, handleMouseMove, handleMouseUp,
    resetInteraction,
  };
}
