export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DragMode = "none" | "drawing" | "moving" | "resizing";
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type HitResult = { mode: DragMode; handle: ResizeHandle | null; cursor: string };

export const SCALE_PRESETS = [25, 50, 75, 100, 150, 200] as const;

export const CORNER_CURSORS: Record<string, string> = {
  nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize",
};

export function computeHitTest(pos: { x: number; y: number }, cr: CropRect, t: number): HitResult {
  const nearLeft = Math.abs(pos.x - cr.x) < t;
  const nearRight = Math.abs(pos.x - (cr.x + cr.width)) < t;
  const nearTop = Math.abs(pos.y - cr.y) < t;
  const nearBottom = Math.abs(pos.y - (cr.y + cr.height)) < t;
  const inX = pos.x > cr.x + t && pos.x < cr.x + cr.width - t;
  const inY = pos.y > cr.y + t && pos.y < cr.y + cr.height - t;
  const inRangeX = pos.x >= cr.x - t && pos.x <= cr.x + cr.width + t;
  const inRangeY = pos.y >= cr.y - t && pos.y <= cr.y + cr.height + t;

  // Corner handles
  const corner = detectCorner(nearTop, nearBottom, nearLeft, nearRight, inRangeX, inRangeY);
  if (corner) return { mode: "resizing", handle: corner, cursor: CORNER_CURSORS[corner] };

  // Edge handles
  const edge = detectEdge(nearTop, nearBottom, nearLeft, nearRight, inX, inY);
  if (edge) return edge;

  if (inX && inY) return { mode: "moving", handle: null, cursor: "move" };
  return { mode: "drawing", handle: null, cursor: "crosshair" };
}

export function detectCorner(nearTop: boolean, nearBottom: boolean, nearLeft: boolean, nearRight: boolean, inRangeX: boolean, inRangeY: boolean): ResizeHandle | null {
  if (!inRangeX || !inRangeY) return null;
  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  return null;
}

export function detectEdge(nearTop: boolean, nearBottom: boolean, nearLeft: boolean, nearRight: boolean, inX: boolean, inY: boolean): HitResult | null {
  if (nearTop && inX) return { mode: "resizing", handle: "n", cursor: "ns-resize" };
  if (nearBottom && inX) return { mode: "resizing", handle: "s", cursor: "ns-resize" };
  if (nearLeft && inY) return { mode: "resizing", handle: "w", cursor: "ew-resize" };
  if (nearRight && inY) return { mode: "resizing", handle: "e", cursor: "ew-resize" };
  return null;
}

export function applyDrawing(startPos: { x: number; y: number }, pos: { x: number; y: number }): CropRect {
  return {
    x: Math.min(startPos.x, pos.x),
    y: Math.min(startPos.y, pos.y),
    width: Math.abs(pos.x - startPos.x),
    height: Math.abs(pos.y - startPos.y),
  };
}

export function applyMoving(startPos: { x: number; y: number }, pos: { x: number; y: number }, startRect: CropRect): CropRect {
  const dx = pos.x - startPos.x;
  const dy = pos.y - startPos.y;
  const nx = Math.max(0, Math.min(1 - startRect.width, startRect.x + dx));
  const ny = Math.max(0, Math.min(1 - startRect.height, startRect.y + dy));
  return { x: nx, y: ny, width: startRect.width, height: startRect.height };
}

export function applyResizing(startPos: { x: number; y: number }, pos: { x: number; y: number }, startRect: CropRect, handle: ResizeHandle): CropRect {
  const dx = pos.x - startPos.x;
  const dy = pos.y - startPos.y;
  let { x, y, width, height } = startRect;
  if (handle.includes("w")) { x = Math.max(0, x + dx); width = Math.max(0.01, startRect.x + startRect.width - x); }
  if (handle.includes("e")) { width = Math.max(0.01, Math.min(1 - x, startRect.width + dx)); }
  if (handle.includes("n")) { y = Math.max(0, y + dy); height = Math.max(0.01, startRect.y + startRect.height - y); }
  if (handle.includes("s")) { height = Math.max(0.01, Math.min(1 - y, startRect.height + dy)); }
  return { x, y, width, height };
}
