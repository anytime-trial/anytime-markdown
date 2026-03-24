import { useCallback, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_WHEEL_STEP = 0.1;
const ZOOM_BUTTON_STEP = 0.25;

export interface UseZoomPanReturn {
  zoom: number;
  pan: Point;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  isDirty: boolean;
  isPanningRef: React.RefObject<boolean>;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: () => void;
  handleWheel: (e: React.WheelEvent) => void;
}

export function useZoomPan(): UseZoomPanReturn {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isPanningRef.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    setZoom((v) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v + (e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP))));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((v) => Math.min(ZOOM_MAX, v + ZOOM_BUTTON_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((v) => Math.max(ZOOM_MIN, v - ZOOM_BUTTON_STEP));
  }, []);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const isDirty = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  return {
    zoom,
    pan,
    setZoom,
    zoomIn,
    zoomOut,
    reset,
    isDirty,
    isPanningRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
  };
}
