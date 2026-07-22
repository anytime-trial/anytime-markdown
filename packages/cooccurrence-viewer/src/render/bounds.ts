import type { RenderGraph } from '../types';
import type { Bounds } from '../viewport/viewport';

export function graphBounds(graph: RenderGraph): Bounds | null {
  if (graph.nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  return { minX, minY, maxX, maxY };
}
