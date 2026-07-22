import type { CanvasSize, ScreenPoint, ViewportState, WorldPoint } from '../types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function worldToScreen(point: WorldPoint, viewport: ViewportState): ScreenPoint {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

export function screenToWorld(point: ScreenPoint, viewport: ViewportState): WorldPoint {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  };
}

export function zoomAt(viewport: ViewportState, screen: ScreenPoint, factor: number): ViewportState {
  const nextScale = Math.max(0.05, Math.min(8, viewport.scale * factor));
  const world = screenToWorld(screen, viewport);
  return {
    scale: nextScale,
    offsetX: screen.x - world.x * nextScale,
    offsetY: screen.y - world.y * nextScale,
  };
}

export function pan(viewport: ViewportState, dx: number, dy: number): ViewportState {
  return { ...viewport, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy };
}

export function fitBounds(bounds: Bounds | null, size: CanvasSize, padding = 48): ViewportState {
  if (!bounds || size.width <= 0 || size.height <= 0) {
    return { scale: 1, offsetX: size.width / 2, offsetY: size.height / 2 };
  }
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const scale = Math.max(0.05, Math.min(4, Math.min(availableWidth / width, availableHeight / height)));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    offsetX: size.width / 2 - cx * scale,
    offsetY: size.height / 2 - cy * scale,
  };
}
