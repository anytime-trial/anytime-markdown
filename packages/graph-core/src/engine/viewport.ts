import { Viewport } from '../types';

/** Screen coords to world coords */
export function screenToWorld(viewport: Viewport, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - viewport.offsetX) / viewport.scale,
    y: (screenY - viewport.offsetY) / viewport.scale,
  };
}

/** World coords to screen coords */
export function worldToScreen(viewport: Viewport, worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: worldX * viewport.scale + viewport.offsetX,
    y: worldY * viewport.scale + viewport.offsetY,
  };
}

/** Pan */
export function pan(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy };
}

/** Zoom centered on screen point — continuous scale proportional to delta */
export function zoom(viewport: Viewport, screenX: number, screenY: number, delta: number): Viewport {
  const sensitivity = 0.001;
  const factor = Math.pow(2, -delta * sensitivity);
  const newScale = Math.min(Math.max(viewport.scale * factor, 0.1), 10);
  const worldBeforeZoom = screenToWorld(viewport, screenX, screenY);
  const newOffsetX = screenX - worldBeforeZoom.x * newScale;
  const newOffsetY = screenY - worldBeforeZoom.y * newScale;
  return { offsetX: newOffsetX, offsetY: newOffsetY, scale: newScale };
}

/** Fit to content */
export function fitToContent(
  canvasWidth: number,
  canvasHeight: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  padding: number = 50,
): Viewport {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  if (boundsWidth <= 0 || boundsHeight <= 0) return { offsetX: 0, offsetY: 0, scale: 1 };
  const contentWidth = boundsWidth + padding * 2;
  const contentHeight = boundsHeight + padding * 2;
  const scale = Math.min(canvasWidth / contentWidth, canvasHeight / contentHeight, 2);
  const offsetX = (canvasWidth - (bounds.maxX + bounds.minX) * scale) / 2;
  const offsetY = (canvasHeight - (bounds.maxY + bounds.minY) * scale) / 2;
  return { offsetX, offsetY, scale };
}
