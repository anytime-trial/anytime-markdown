import type { GraphEdge, GraphNode } from '../types';
import type { Side } from './connector';
import { bestSides, computeBezierPath, computeOrthogonalPath, getConnectionPoints, resolveConnectorEndpoints } from './connector';
import { computeVisibilityPath } from './orthogonalRouter';

/** 制御点を接続辺に垂直な方向にオフセットする */
function deflectControlPoint(cp: { x: number; y: number }, side: Side, amount: number): { x: number; y: number } {
  if (side === 'left' || side === 'right') return { x: cp.x, y: cp.y + amount };
  return { x: cp.x + amount, y: cp.y };
}

/** 接続ポイントを辺に沿った方向にオフセットする */
function offsetAlongSide(pt: { side: Side; x: number; y: number }, side: Side, offset: number): { side: Side; x: number; y: number } {
  if (side === 'left' || side === 'right') return { ...pt, y: pt.y + offset };
  return { ...pt, x: pt.x + offset };
}

/** 無向ペアキー（順序非依存） */
function makePairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** フォースレイアウト中の高速パス: 中心間直線として変換 */
function resolveLayoutRunningEdge(e: GraphEdge, nodeMap: Map<string, GraphNode>): GraphEdge {
  if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
    const fromNode = nodeMap.get(e.from.nodeId);
    const toNode = nodeMap.get(e.to.nodeId);
    if (fromNode && toNode) {
      return {
        ...e,
        type: 'line' as const,
        waypoints: undefined,
        bezierPath: undefined,
        from: { ...e.from, x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
        to: { ...e.to, x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 },
      };
    }
  }
  return e;
}

type RoutingContext = {
  fromPt: { side: Side; x: number; y: number };
  toPt: { side: Side; x: number; y: number };
  sides: { fromSide: Side; toSide: Side };
  parallelIndex: number;
  pairTotal: number;
};

function resolveBezierRouting(
  e: GraphEdge, fromNode: GraphNode, toNode: GraphNode, ctx: RoutingContext,
): GraphEdge {
  const { fromPt, toPt, sides, parallelIndex, pairTotal } = ctx;
  const bezierPath = computeBezierPath(fromNode, toNode);
  if (pairTotal > 1) {
    bezierPath[0] = fromPt;
    bezierPath[3] = toPt;
    const deflection = (parallelIndex - (pairTotal - 1) / 2) * 60;
    bezierPath[1] = deflectControlPoint(bezierPath[1], sides.fromSide, deflection);
    bezierPath[2] = deflectControlPoint(bezierPath[2], sides.toSide, deflection);
  }
  return { ...e, from: { ...e.from, ...bezierPath[0] }, to: { ...e.to, ...bezierPath[3] }, bezierPath };
}

function resolveConnectorRouting(
  e: GraphEdge, fromNode: GraphNode, toNode: GraphNode, ctx: RoutingContext,
): GraphEdge {
  const { fromPt, toPt, sides } = ctx;
  const routing = e.style.routing ?? 'orthogonal';
  if (routing === 'bezier') return resolveBezierRouting(e, fromNode, toNode, ctx);
  if (routing === 'straight') return { ...e, from: { ...e.from, ...fromPt }, to: { ...e.to, ...toPt } };
  if (e.manualWaypoints?.length) {
    const waypoints = [fromPt, ...e.manualWaypoints, toPt];
    return { ...e, from: { ...e.from, ...fromPt }, to: { ...e.to, ...toPt }, waypoints };
  }
  if (e.manualMidpoint !== undefined) {
    const waypoints = computeOrthogonalPath(fromNode, toNode, 20, e.manualMidpoint);
    return { ...e, from: { ...e.from, ...waypoints[0] }, to: { ...e.to, ...(waypoints.at(-1) ?? waypoints[0]) }, waypoints };
  }
  const waypoints = computeVisibilityPath(fromPt, sides.fromSide, toPt, sides.toSide, []);
  return { ...e, from: { ...e.from, ...waypoints[0] }, to: { ...e.to, ...(waypoints.at(-1) ?? waypoints[0]) }, waypoints };
}

/**
 * 描画/hitTest 前に connector edge の端点・経路を現在のノード位置から解決する。
 * GraphCanvas（React）と GraphView（vanilla）で共有する純関数。
 */
export function resolveEdgesForRender(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  options?: { layoutRunning?: boolean },
): GraphEdge[] {
  const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));

  if (options?.layoutRunning) {
    return edges.map((e) => resolveLayoutRunningEdge(e, nodeMap));
  }

  const pairTotalMap = new Map<string, number>();
  for (const e of edges) {
    if (e.type !== 'connector' || !e.from.nodeId || !e.to.nodeId) continue;
    const k = makePairKey(e.from.nodeId, e.to.nodeId);
    pairTotalMap.set(k, (pairTotalMap.get(k) ?? 0) + 1);
  }
  const pairCount = new Map<string, number>();

  return edges.map((e) => {
    if (e.type !== 'connector') return e;
    if (!e.from.nodeId || !e.to.nodeId) {
      const pts = resolveConnectorEndpoints(e, nodes);
      return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
    }
    const fromNode = nodeMap.get(e.from.nodeId);
    const toNode = nodeMap.get(e.to.nodeId);
    if (!fromNode || !toNode) {
      const pts = resolveConnectorEndpoints(e, nodes);
      return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
    }
    const pairKey = makePairKey(e.from.nodeId, e.to.nodeId);
    const parallelIndex = pairCount.get(pairKey) ?? 0;
    pairCount.set(pairKey, parallelIndex + 1);
    const pairTotal = pairTotalMap.get(pairKey) ?? 0;
    const sides = bestSides(fromNode, toNode);
    const fromPts = getConnectionPoints(fromNode);
    const toPts = getConnectionPoints(toNode);
    let fromPt = fromPts.find((p) => p.side === sides.fromSide) ?? fromPts[0];
    let toPt = toPts.find((p) => p.side === sides.toSide) ?? toPts[0];
    if (pairTotal > 1) {
      const offset = (parallelIndex - (pairTotal - 1) / 2) * 15;
      fromPt = offsetAlongSide(fromPt, sides.fromSide, offset);
      toPt = offsetAlongSide(toPt, sides.toSide, offset);
    }
    return resolveConnectorRouting(e, fromNode, toNode, { fromPt, toPt, sides, parallelIndex, pairTotal });
  });
}
