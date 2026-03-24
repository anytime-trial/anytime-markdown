import { GraphNode, GraphEdge } from '../types';

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export interface HitResult {
  type: 'node' | 'edge' | 'resize-handle' | 'none';
  id?: string;
  handle?: ResizeHandle;
}

const HANDLE_SIZE = 8;
const EDGE_TOLERANCE = 6;

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function pointInEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitTestResizeHandles(node: GraphNode, wx: number, wy: number, scale: number): ResizeHandle | null {
  const hs = HANDLE_SIZE / scale;
  const { x, y, width: w, height: h } = node;
  const handles: { handle: ResizeHandle; hx: number; hy: number }[] = [
    { handle: 'nw', hx: x, hy: y },
    { handle: 'ne', hx: x + w, hy: y },
    { handle: 'sw', hx: x, hy: y + h },
    { handle: 'se', hx: x + w, hy: y + h },
    { handle: 'n', hx: x + w / 2, hy: y },
    { handle: 's', hx: x + w / 2, hy: y + h },
    { handle: 'e', hx: x + w, hy: y + h / 2 },
    { handle: 'w', hx: x, hy: y + h / 2 },
  ];
  for (const { handle, hx, hy } of handles) {
    if (Math.abs(wx - hx) <= hs && Math.abs(wy - hy) <= hs) return handle;
  }
  return null;
}

function pointInPolygon(px: number, py: number, polygon: {x: number; y: number}[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function hitTestNode(node: GraphNode, wx: number, wy: number): boolean {
  if (node.type === 'ellipse') {
    return pointInEllipse(wx, wy, node.x + node.width / 2, node.y + node.height / 2, node.width / 2, node.height / 2);
  }
  if (node.type === 'diamond') {
    const { x, y, width: w, height: h } = node;
    return pointInPolygon(wx, wy, [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 },
    ]);
  }
  if (node.type === 'parallelogram') {
    const { x, y, width: w, height: h } = node;
    const offset = w * 0.2;
    return pointInPolygon(wx, wy, [
      { x: x + offset, y },
      { x: x + w, y },
      { x: x + w - offset, y: y + h },
      { x, y: y + h },
    ]);
  }
  return pointInRect(wx, wy, node.x, node.y, node.width, node.height);
}

export function hitTestEdge(edge: GraphEdge, wx: number, wy: number, scale: number): boolean {
  const tolerance = EDGE_TOLERANCE / scale;
  return distanceToSegment(wx, wy, edge.from.x, edge.from.y, edge.to.x, edge.to.y) <= tolerance;
}

export function hitTest(
  nodes: GraphNode[], edges: GraphEdge[], wx: number, wy: number, scale: number, selectedNodeIds: string[],
): HitResult {
  for (const id of selectedNodeIds) {
    const node = nodes.find(n => n.id === id);
    if (node) {
      const handle = hitTestResizeHandles(node, wx, wy, scale);
      if (handle) return { type: 'resize-handle', id: node.id, handle };
    }
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (hitTestNode(nodes[i], wx, wy)) return { type: 'node', id: nodes[i].id };
  }
  for (let i = edges.length - 1; i >= 0; i--) {
    if (hitTestEdge(edges[i], wx, wy, scale)) return { type: 'edge', id: edges[i].id };
  }
  return { type: 'none' };
}
