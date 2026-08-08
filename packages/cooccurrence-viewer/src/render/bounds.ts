import type { RenderGraph } from '../types';
import type { Bounds } from '../viewport/viewport';

export function graphBounds(graph: RenderGraph): Bounds | null {
  if (graph.nodes.length === 0) return null;
  // カード表示では語の広がりは半径でなくカードの寸法で決まる。半径のままだと、横長のカードの
  // 左右が「全体表示」で見切れる（カード幅 180 に対して最大半径は 64）。
  const halfWidth = graph.cardView === undefined ? undefined : graph.cardView.cardWidth / 2;
  const halfHeight = graph.cardView === undefined ? undefined : graph.cardView.cardHeight / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    minX = Math.min(minX, node.x - (halfWidth ?? node.radius));
    minY = Math.min(minY, node.y - (halfHeight ?? node.radius));
    maxX = Math.max(maxX, node.x + (halfWidth ?? node.radius));
    maxY = Math.max(maxY, node.y + (halfHeight ?? node.radius));
  }
  // カラム見出しの帯（カラム上端）も収める。語だけで囲むと見出しが全体表示から外れる。
  for (const column of graph.cardView?.columns ?? []) {
    minX = Math.min(minX, column.x);
    minY = Math.min(minY, column.y);
    maxX = Math.max(maxX, column.x + column.width);
  }
  return { minX, minY, maxX, maxY };
}
