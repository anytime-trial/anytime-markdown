import { GraphNode, GraphEdge } from '../types';
import {
  PARALLELOGRAM_OFFSET_RATIO,
  CYLINDER_ELLIPSE_HEIGHT_RATIO, CYLINDER_ELLIPSE_MAX_HEIGHT,
  ORTHOGONAL_MARGIN, BEZIER_MIN_CP_DISTANCE,
  CONNECTION_HIT_RADIUS, BORDER_HIT_RADIUS,
} from './constants';

export function nodeCenter(node: GraphNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function rectIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = node.width / 2;
  const hh = node.height / 2;
  const scaleX = hw / Math.abs(dx || 1);
  const scaleY = hh / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function ellipseIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const rx = node.width / 2;
  const ry = node.height / 2;
  const angle = Math.atan2(dy, dx);
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function diamondIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = node.width / 2;
  const hh = node.height / 2;
  // Diamond edge equation: |dx/hw| + |dy/hh| = 1
  const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function parallelogramIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = node.width / 2;
  const hh = node.height / 2;
  const offset = node.width * PARALLELOGRAM_OFFSET_RATIO;

  // Parallelogram vertices (relative to center)
  const verts = [
    { x: -hw + offset, y: -hh },  // top-left
    { x: hw, y: -hh },             // top-right
    { x: hw - offset, y: hh },     // bottom-right
    { x: -hw, y: hh },             // bottom-left
  ];

  // Ray-polygon intersection: find closest edge intersection
  let bestT = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const v1 = verts[i];
    const v2 = verts[(i + 1) % verts.length];
    const ex = v2.x - v1.x;
    const ey = v2.y - v1.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue;
    const t = ((v1.x - 0) * ey - (v1.y - 0) * ex) / -denom;
    const u = ((0 - v1.x) * dy - (0 - v1.y) * dx) / denom;
    if (t > 0 && u >= 0 && u <= 1 && t < bestT) {
      bestT = t;
    }
  }
  if (bestT === Infinity) return rectIntersection(node, targetX, targetY);
  return { x: cx + dx * bestT, y: cy + dy * bestT };
}

function cylinderIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = node.width / 2;
  const hh = node.height / 2;
  const ellipseH = Math.min(node.height * CYLINDER_ELLIPSE_HEIGHT_RATIO, CYLINDER_ELLIPSE_MAX_HEIGHT);

  // Check intersection with top ellipse
  const topCy = node.y + ellipseH;
  const topDy = targetY - topCy;
  if (dy < 0) {
    const angle = Math.atan2(topDy, dx);
    const ix = cx + hw * Math.cos(angle);
    const iy = topCy + ellipseH * Math.sin(angle);
    if (iy <= topCy) return { x: ix, y: iy };
  }

  // Check intersection with bottom ellipse
  const botCy = node.y + node.height - ellipseH;
  const botDy = targetY - botCy;
  if (dy > 0) {
    const angle = Math.atan2(botDy, dx);
    const ix = cx + hw * Math.cos(angle);
    const iy = botCy + ellipseH * Math.sin(angle);
    if (iy >= botCy) return { x: ix, y: iy };
  }

  // Body sides (left/right)
  const scaleX = hw / Math.abs(dx || 1);
  const scaleY = hh / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function nodeIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  if (node.type === 'ellipse') return ellipseIntersection(node, targetX, targetY);
  if (node.type === 'diamond') return diamondIntersection(node, targetX, targetY);
  if (node.type === 'parallelogram') return parallelogramIntersection(node, targetX, targetY);
  if (node.type === 'cylinder') return cylinderIntersection(node, targetX, targetY);
  return rectIntersection(node, targetX, targetY);
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** ノードの4辺中央の接続ポイント + extraConnectionPoints */
export function getConnectionPoints(node: GraphNode): { side: Side; x: number; y: number }[] {
  const { x, y, width: w, height: h } = node;
  const points: { side: Side; x: number; y: number }[] = [
    { side: 'top', x: x + w / 2, y },
    { side: 'right', x: x + w, y: y + h / 2 },
    { side: 'bottom', x: x + w / 2, y: y + h },
    { side: 'left', x: x, y: y + h / 2 },
  ];

  if (node.extraConnectionPoints) {
    for (const ep of node.extraConnectionPoints) {
      const px = x + w * ep.x;
      const py = y + h * ep.y;
      const side = determineSide(ep.x, ep.y);
      points.push({ side, x: px, y: py });
    }
  }

  return points;
}

/** 正規化座標からどの辺に最も近いかを判定 */
function determineSide(nx: number, ny: number): Side {
  const dists: { side: Side; d: number }[] = [
    { side: 'top', d: ny },
    { side: 'bottom', d: 1 - ny },
    { side: 'left', d: nx },
    { side: 'right', d: 1 - nx },
  ];
  return dists.toSorted((a, b) => a.d - b.d)[0].side;
}

/** 指定座標に最も近い接続ポイントを返す */
export function nearestConnectionPoint(node: GraphNode, tx: number, ty: number): { side: Side; x: number; y: number } {
  const points = getConnectionPoints(node);
  let best = points[0];
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - tx, p.y - ty);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** 接続ポイントのhit判定。定義済みポイント優先、辺境界付近ならその位置を返す */
export function hitTestConnectionPoint(
  node: GraphNode, wx: number, wy: number, scale: number,
): { side: Side; x: number; y: number } | null {
  const handleRadius = CONNECTION_HIT_RADIUS / scale;
  // 定義済み接続ポイント（4辺中央 + extra）を優先判定
  for (const p of getConnectionPoints(node)) {
    if (Math.hypot(wx - p.x, wy - p.y) <= handleRadius) return p;
  }
  // ノード辺境界付近なら辺上の最近点で接続（広いゾーン）
  const borderRadius = BORDER_HIT_RADIUS / scale;
  const border = nearestBorderPoint(node, wx, wy);
  if (border && Math.hypot(wx - border.x, wy - border.y) <= borderRadius) {
    return border;
  }
  return null;
}

/** ノード境界上の最近点とその辺を返す（矩形ベース） */
export function nearestBorderPoint(
  node: GraphNode, wx: number, wy: number,
): { side: Side; x: number; y: number } | null {
  const { x, y, width: w, height: h } = node;
  // 各辺上の最近点を計算
  const candidates: { side: Side; x: number; y: number; dist: number }[] = [
    { side: 'top', x: Math.max(x, Math.min(x + w, wx)), y, dist: Math.abs(wy - y) },
    { side: 'bottom', x: Math.max(x, Math.min(x + w, wx)), y: y + h, dist: Math.abs(wy - (y + h)) },
    { side: 'left', x, y: Math.max(y, Math.min(y + h, wy)), dist: Math.abs(wx - x) },
    { side: 'right', x: x + w, y: Math.max(y, Math.min(y + h, wy)), dist: Math.abs(wx - (x + w)) },
  ];
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].dist < best.dist) best = candidates[i];
  }
  return { side: best.side, x: best.x, y: best.y };
}

/** 2ノード間の最適な接続辺を決定 */
export function bestSides(fromNode: GraphNode, toNode: GraphNode): { fromSide: Side; toSide: Side } {
  const fc = nodeCenter(fromNode);
  const tc = nodeCenter(toNode);
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;

  let fromSide: Side;
  let toSide: Side;

  if (Math.abs(dx) > Math.abs(dy)) {
    fromSide = dx > 0 ? 'right' : 'left';
    toSide = dx > 0 ? 'left' : 'right';
  } else {
    fromSide = dy > 0 ? 'bottom' : 'top';
    toSide = dy > 0 ? 'top' : 'bottom';
  }

  return { fromSide, toSide };
}

/** 辺の方向に応じたオフセット座標 */
function offsetPoint(pt: { x: number; y: number }, side: Side, margin: number): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: pt.x, y: pt.y - margin };
    case 'bottom': return { x: pt.x, y: pt.y + margin };
    case 'left': return { x: pt.x - margin, y: pt.y };
    case 'right': return { x: pt.x + margin, y: pt.y };
  }
}

/** 直角折れ線のウェイポイントを計算 */
export function computeOrthogonalPath(
  fromNode: GraphNode,
  toNode: GraphNode,
  margin: number = ORTHOGONAL_MARGIN,
  manualMidpoint?: number,
): { x: number; y: number }[] {
  const { fromSide, toSide } = bestSides(fromNode, toNode);
  const fromPts = getConnectionPoints(fromNode);
  const toPts = getConnectionPoints(toNode);
  const fromPt = fromPts.find(p => p.side === fromSide)!;
  const toPt = toPts.find(p => p.side === toSide)!;

  const p1 = offsetPoint(fromPt, fromSide, margin);
  const p4 = offsetPoint(toPt, toSide, margin);

  const points: { x: number; y: number }[] = [fromPt];

  // 対向する辺（right↔left, top↔bottom）の場合: 中間点で折れる
  const isHorizontal = fromSide === 'right' || fromSide === 'left';
  const isOpposite =
    (fromSide === 'right' && toSide === 'left') ||
    (fromSide === 'left' && toSide === 'right') ||
    (fromSide === 'top' && toSide === 'bottom') ||
    (fromSide === 'bottom' && toSide === 'top');

  if (isOpposite) {
    if (isHorizontal) {
      const midX = manualMidpoint ?? (p1.x + p4.x) / 2;
      points.push({ x: midX, y: fromPt.y }, { x: midX, y: toPt.y });
    } else {
      const midY = manualMidpoint ?? (p1.y + p4.y) / 2;
      points.push({ x: fromPt.x, y: midY }, { x: toPt.x, y: midY });
    }
  } else {
    // 同方向や直交する場合: L字またはZ字
    points.push(p1);
    if (isHorizontal) {
      points.push({ x: p1.x, y: p4.y });
    } else {
      points.push({ x: p4.x, y: p1.y });
    }
    points.push(p4);
  }

  points.push(toPt);
  return points;
}

/** ベジェ曲線の制御点を含む4点パスを計算 [start, cp1, cp2, end] */
export function computeBezierPath(
  fromNode: GraphNode,
  toNode: GraphNode,
): { x: number; y: number }[] {
  const { fromSide, toSide } = bestSides(fromNode, toNode);
  const fromPts = getConnectionPoints(fromNode);
  const toPts = getConnectionPoints(toNode);
  const fromPt = fromPts.find(p => p.side === fromSide)!;
  const toPt = toPts.find(p => p.side === toSide)!;

  const dist = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y);
  const cpDist = Math.max(dist / 3, BEZIER_MIN_CP_DISTANCE);

  const cp1 = offsetPoint(fromPt, fromSide, cpDist);
  const cp2 = offsetPoint(toPt, toSide, cpDist);

  return [fromPt, cp1, cp2, toPt];
}

export function resolveConnectorEndpoints(
  edge: GraphEdge,
  nodes: readonly GraphNode[],
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const fromNode = edge.from.nodeId ? nodes.find((n) => n.id === edge.from.nodeId) : null;
  const toNode = edge.to.nodeId ? nodes.find((n) => n.id === edge.to.nodeId) : null;
  let fromPt = { x: edge.from.x, y: edge.from.y };
  let toPt = { x: edge.to.x, y: edge.to.y };
  if (fromNode && toNode) {
    const fromCenter = nodeCenter(fromNode);
    const toCenter = nodeCenter(toNode);
    fromPt = nodeIntersection(fromNode, toCenter.x, toCenter.y);
    toPt = nodeIntersection(toNode, fromCenter.x, fromCenter.y);
  } else if (fromNode) {
    fromPt = nodeIntersection(fromNode, toPt.x, toPt.y);
  } else if (toNode) {
    toPt = nodeIntersection(toNode, fromPt.x, fromPt.y);
  }
  return { from: fromPt, to: toPt };
}
