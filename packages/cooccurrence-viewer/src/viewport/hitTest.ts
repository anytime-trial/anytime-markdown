import type { RenderGraph, RenderLink, RenderNode, ViewportState } from '../types';
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

/**
 * 線の当たり判定に使う、線からの許容距離（画面ピクセル）。
 *
 * 線は太さが強度の符号であり（設計書 §3.1）、細い共起ほど当たり判定も細くなると、
 * 弱い共起のメモだけが実質読めなくなる。太さに関係なく同じ幅で拾う。
 */
const LINK_HIT_TOLERANCE_PX = 6;

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  // 両端が同じ位置にある共起は点として扱う（自己共起は検証で拒否されるが、座標の重なりは起きうる）。
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * 画面座標から共起（線）を拾う。
 *
 * 円との優先順位はここで決めない。呼び出し側が円を先に試す（設計書 §3.1: 円は線より小さく、
 * 線は円の間を通るため、線を優先すると語を触れなくなる）。
 */
export function hitTestLink(
  graph: RenderGraph,
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): RenderLink | null {
  const world = screenToWorld({ x: screenX, y: screenY }, viewport);
  const nodeByIndex = new Map(graph.nodes.map((node) => [node.index, node]));
  const tolerance = LINK_HIT_TOLERANCE_PX / viewport.scale;
  let best: { link: RenderLink; distance: number } | null = null;
  for (const link of graph.links) {
    const source = nodeByIndex.get(link.source);
    const target = nodeByIndex.get(link.target);
    if (!source || !target) continue;
    const distance = distanceToSegment(world.x, world.y, source.x, source.y, target.x, target.y);
    const limit = Math.max(tolerance, link.width / 2);
    if (distance > limit) continue;
    // 重なった線では近いほうを拾う。手前に描かれた線を優先すると、太い線が細い線を覆い隠す。
    if (best === null || distance < best.distance) best = { link, distance };
  }
  return best?.link ?? null;
}
