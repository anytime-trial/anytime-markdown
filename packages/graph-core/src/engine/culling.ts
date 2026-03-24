import { GraphNode, GraphEdge, Viewport } from '../types';

export interface VisibleBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULT_MARGIN = 50;

/** Compute the world-space visible bounds from viewport and canvas dimensions */
export function getVisibleBounds(
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  margin: number = DEFAULT_MARGIN,
): VisibleBounds {
  return {
    minX: -viewport.offsetX / viewport.scale - margin,
    minY: -viewport.offsetY / viewport.scale - margin,
    maxX: (canvasWidth - viewport.offsetX) / viewport.scale + margin,
    maxY: (canvasHeight - viewport.offsetY) / viewport.scale + margin,
  };
}

/** Check if a node's bounding box intersects the visible bounds */
export function isNodeVisible(node: GraphNode, bounds: VisibleBounds): boolean {
  return (
    node.x + node.width > bounds.minX &&
    node.x < bounds.maxX &&
    node.y + node.height > bounds.minY &&
    node.y < bounds.maxY
  );
}

/** Check if an edge (or any of its waypoints) intersects the visible bounds */
export function isEdgeVisible(
  edge: GraphEdge,
  bounds: VisibleBounds,
): boolean {
  const points: { x: number; y: number }[] = [
    { x: edge.from.x, y: edge.from.y },
    { x: edge.to.x, y: edge.to.y },
  ];
  if (edge.waypoints) {
    points.push(...edge.waypoints);
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return (
    maxX > bounds.minX &&
    minX < bounds.maxX &&
    maxY > bounds.minY &&
    minY < bounds.maxY
  );
}
