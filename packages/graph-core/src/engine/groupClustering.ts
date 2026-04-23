import type { GraphNode } from '../types';

/**
 * Y 座標に基づいてメンバーをクラスタリングする。
 * 同じ Y 行（行間距離 < rowThreshold）にあるノード同士を1つのクラスタとする。
 * rowThreshold 省略時は `max(heights) * 1.5` を使う。
 */
export function clusterByY(members: readonly GraphNode[], rowThreshold?: number): GraphNode[][] {
  if (members.length === 0) return [];
  const threshold = rowThreshold ?? Math.max(...members.map(n => n.height)) * 1.5;
  const sorted = [...members].sort((a, b) => a.y - b.y);
  const clusters: GraphNode[][] = [];
  for (const m of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(m.y - last[0].y) < threshold) last.push(m);
    else clusters.push([m]);
  }
  return clusters;
}
