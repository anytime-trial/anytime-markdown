import type { RenderGraph, RenderNode, ViewportState } from '../types';
import { screenToWorld } from './viewport';

export function hitTestNode(graph: RenderGraph, screenX: number, screenY: number, viewport: ViewportState): RenderNode | null {
  const world = screenToWorld({ x: screenX, y: screenY }, viewport);
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    const dx = world.x - node.x;
    const dy = world.y - node.y;
    if (Math.hypot(dx, dy) <= node.radius) return node;
  }
  return null;
}
