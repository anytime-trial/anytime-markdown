export type Side = 'top' | 'right' | 'bottom' | 'left';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VNode {
  readonly x: number;
  readonly y: number;
  readonly id: number;
}

export interface VEdge {
  readonly from: number;
  readonly to: number;
  readonly distance: number;
  readonly horizontal: boolean;
}

/** 各矩形をマージン分拡張する */
export function buildMarginRects(
  rects: readonly Rect[],
  margin: number,
): Rect[] {
  return rects.map((r) => ({
    x: r.x - margin,
    y: r.y - margin,
    width: r.width + margin * 2,
    height: r.height + margin * 2,
  }));
}

/**
 * 水平/垂直の線分が矩形の厳密内部と交差するか判定する。
 * padding で矩形を仮想的に拡張できる。
 * 矩形の辺上を走る線分（端点が角にある場合等）は交差とみなさない。
 */
function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  rect: Rect,
  padding: number = 0,
): boolean {
  const rMinX = rect.x - padding;
  const rMinY = rect.y - padding;
  const rMaxX = rect.x + rect.width + padding;
  const rMaxY = rect.y + rect.height + padding;

  if (p1.y === p2.y) {
    const y = p1.y;
    if (y <= rMinY || y >= rMaxY) return false;
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    return maxX > rMinX && minX < rMaxX;
  }

  if (p1.x === p2.x) {
    const x = p1.x;
    if (x <= rMinX || x >= rMaxX) return false;
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    return maxY > rMinY && minY < rMaxY;
  }

  return false;
}

/** 2ノード間が水平/垂直に整列しており、障害物に遮られていないか判定する */
export function isVisible(
  a: VNode,
  b: VNode,
  obstacles: readonly Rect[],
): boolean {
  const isHorizontal = a.y === b.y;
  const isVertical = a.x === b.x;

  if (!isHorizontal && !isVertical) return false;

  for (const obstacle of obstacles) {
    if (segmentIntersectsRect(a, b, obstacle)) {
      return false;
    }
  }

  return true;
}

type Direction = 'h' | 'v' | 'init';

interface HeapEntry {
  readonly cost: number;
  readonly nodeId: number;
  readonly dir: Direction;
}

class MinHeap {
  private readonly data: HeapEntry[] = [];

  get size(): number {
    return this.data.length;
  }

  push(entry: HeapEntry): void {
    this.data.push(entry);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].cost <= this.data[i].cost) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].cost < this.data[smallest].cost) {
        smallest = left;
      }
      if (right < n && this.data[right].cost < this.data[smallest].cost) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

function buildAdjacencyList(
  edges: readonly VEdge[],
): Map<number, Array<{ to: number; distance: number; horizontal: boolean }>> {
  const adj = new Map<number, Array<{ to: number; distance: number; horizontal: boolean }>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ to: e.to, distance: e.distance, horizontal: e.horizontal });
    adj.get(e.to)!.push({ to: e.from, distance: e.distance, horizontal: e.horizontal });
  }
  return adj;
}

function reconstructPath(
  prev: Map<string, { nodeId: number; dir: Direction } | null>,
  endId: number,
  endDir: Direction,
): number[] {
  const path: number[] = [];
  let current: { nodeId: number; dir: Direction } | null = { nodeId: endId, dir: endDir };
  while (current) {
    path.push(current.nodeId);
    const prevKey: string = `${current.nodeId},${current.dir}`;
    current = prev.get(prevKey) ?? null;
  }
  path.reverse();
  return path;
}

/**
 * 折れペナルティ付き Dijkstra。
 * エッジの方向が変わるたびに bendPenalty をコストに加算する。
 */
export function dijkstraWithBendPenalty(
  _nodes: readonly VNode[],
  edges: readonly VEdge[],
  startId: number,
  endId: number,
  startDir: Direction,
  bendPenalty: number,
): number[] | null {
  const adj = buildAdjacencyList(edges);
  const dist = new Map<string, number>();
  const prev = new Map<string, { nodeId: number; dir: Direction } | null>();
  const heap = new MinHeap();

  const startKey = `${startId},${startDir}`;
  dist.set(startKey, 0);
  prev.set(startKey, null);
  heap.push({ cost: 0, nodeId: startId, dir: startDir });

  while (heap.size > 0) {
    const { cost, nodeId, dir } = heap.pop()!;
    const key = `${nodeId},${dir}`;

    if (cost > (dist.get(key) ?? Infinity)) continue;
    if (nodeId === endId) return reconstructPath(prev, endId, dir);

    const neighbors = adj.get(nodeId);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      const edgeDir: Direction = neighbor.horizontal ? 'h' : 'v';
      const bend = dir !== 'init' && dir !== edgeDir ? bendPenalty : 0;
      const newCost = cost + neighbor.distance + bend;
      const neighborKey = `${neighbor.to},${edgeDir}`;

      if (newCost < (dist.get(neighborKey) ?? Infinity)) {
        dist.set(neighborKey, newCost);
        prev.set(neighborKey, { nodeId, dir });
        heap.push({ cost: newCost, nodeId: neighbor.to, dir: edgeDir });
      }
    }
  }

  return null;
}

/**
 * 垂直セグメントの移動可能な x 範囲を障害物で制約する。
 * セグメントの y 範囲と重なる障害物のみ考慮する。
 */
function constrainVerticalRange(
  lowerBound: number,
  upperBound: number,
  segMinY: number,
  segMaxY: number,
  segCurrentX: number,
  obstacles: readonly Rect[],
): { lower: number; upper: number } {
  let lower = lowerBound;
  let upper = upperBound;
  for (const obs of obstacles) {
    const obsMinY = obs.y;
    const obsMaxY = obs.y + obs.height;
    if (obsMaxY <= segMinY || obsMinY >= segMaxY) continue;

    const obsRight = obs.x + obs.width;
    if (obsRight <= segCurrentX && obsRight > lower) {
      lower = obsRight;
    }
    if (obs.x >= segCurrentX && obs.x < upper) {
      upper = obs.x;
    }
  }
  return { lower, upper };
}

/**
 * 水平セグメントの移動可能な y 範囲を障害物で制約する。
 * セグメントの x 範囲と重なる障害物のみ考慮する。
 */
function constrainHorizontalRange(
  lowerBound: number,
  upperBound: number,
  segMinX: number,
  segMaxX: number,
  segCurrentY: number,
  obstacles: readonly Rect[],
): { lower: number; upper: number } {
  let lower = lowerBound;
  let upper = upperBound;
  for (const obs of obstacles) {
    const obsMinX = obs.x;
    const obsMaxX = obs.x + obs.width;
    if (obsMaxX <= segMinX || obsMinX >= segMaxX) continue;

    const obsBottom = obs.y + obs.height;
    if (obsBottom <= segCurrentY && obsBottom > lower) {
      lower = obsBottom;
    }
    if (obs.y >= segCurrentY && obs.y < upper) {
      upper = obs.y;
    }
  }
  return { lower, upper };
}

/**
 * パスの中間セグメントを利用可能スペースの中央に寄せる（nudging）。
 * 入力パスは変更せず、新しいパスを返す。
 */
export function nudgePath(
  path: readonly Point[],
  obstacles: readonly Rect[],
): Point[] {
  const result = path.map((p) => ({ x: p.x, y: p.y }));
  if (result.length < 4) return result;

  for (let i = 1; i < result.length - 2; i++) {
    const p = result[i];
    const q = result[i + 1];
    const prev = result[i - 1];
    const next = result[i + 2];

    if (p.x === q.x) {
      // Vertical segment: can move in x
      const lowerBound = Math.min(prev.x, next.x);
      const upperBound = Math.max(prev.x, next.x);
      const segMinY = Math.min(p.y, q.y);
      const segMaxY = Math.max(p.y, q.y);
      const { lower, upper } = constrainVerticalRange(
        lowerBound, upperBound, segMinY, segMaxY, p.x, obstacles,
      );
      const center = Math.round((lower + upper) / 2);
      result[i] = { x: center, y: p.y };
      result[i + 1] = { x: center, y: q.y };
    } else if (p.y === q.y) {
      // Horizontal segment: can move in y
      const lowerBound = Math.min(prev.y, next.y);
      const upperBound = Math.max(prev.y, next.y);
      const segMinX = Math.min(p.x, q.x);
      const segMaxX = Math.max(p.x, q.x);
      const { lower, upper } = constrainHorizontalRange(
        lowerBound, upperBound, segMinX, segMaxX, p.y, obstacles,
      );
      const center = Math.round((lower + upper) / 2);
      result[i] = { x: p.x, y: center };
      result[i + 1] = { x: q.x, y: center };
    }
  }

  return result;
}

/** 全ノードペアの可視性を判定し、可視エッジのリストを返す */
export function buildVisibilityGraph(
  nodes: readonly VNode[],
  obstacles: readonly Rect[],
): VEdge[] {
  const edges: VEdge[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      if (!isVisible(a, b, obstacles)) continue;

      const horizontal = a.y === b.y;
      const distance = horizontal
        ? Math.abs(a.x - b.x)
        : Math.abs(a.y - b.y);

      edges.push({
        from: a.id,
        to: b.id,
        distance,
        horizontal,
      });
    }
  }

  return edges;
}

/** 同方向の連続セグメントを統合して冗長なウェイポイントを除去 */
function simplifyPath(path: Point[]): Point[] {
  if (path.length <= 2) return path;

  const result: Point[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result.at(-1)!;
    const curr = path[i];
    const next = path[i + 1];
    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;
    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(path.at(-1)!);
  return result;
}

/**
 * 始点/終点の最初/最後のセグメントが辺と垂直になるよう補正する。
 *
 * 隣接点の座標を揃えつつ、その先の点との間で斜め線が発生する場合は
 * コーナー点を挿入して直交性を維持する。
 */
function ensurePerpendicularEntry(
  path: Array<{ x: number; y: number }>,
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
  _margin: number,
): void {
  if (path.length < 3) return;

  const isFromHorizontal = fromSide === 'right' || fromSide === 'left';

  // 始点側
  if (isFromHorizontal ? path[1].y !== fromPt.y : path[1].x !== fromPt.x) {
    const oldP1 = path[1];
    if (isFromHorizontal) {
      path[1] = { x: oldP1.x, y: fromPt.y };
      if (path.length > 2 && path[2].x !== path[1].x && path[2].y !== path[1].y) {
        path.splice(2, 0, { x: path[1].x, y: path[2].y });
      }
    } else {
      path[1] = { x: fromPt.x, y: oldP1.y };
      if (path.length > 2 && path[2].x !== path[1].x && path[2].y !== path[1].y) {
        path.splice(2, 0, { x: path[2].x, y: path[1].y });
      }
    }
  }

  // 終点側
  const last = path.length - 1;
  const isToHorizontal = toSide === 'right' || toSide === 'left';
  if (isToHorizontal ? path[last - 1].y !== toPt.y : path[last - 1].x !== toPt.x) {
    const oldPrev = path[last - 1];
    if (isToHorizontal) {
      path[last - 1] = { x: oldPrev.x, y: toPt.y };
      if (last - 2 >= 0 && path[last - 2].x !== path[last - 1].x && path[last - 2].y !== path[last - 1].y) {
        path.splice(last - 1, 0, { x: path[last - 1].x, y: path[last - 2].y });
      }
    } else {
      path[last - 1] = { x: toPt.x, y: oldPrev.y };
      if (last - 2 >= 0 && path[last - 2].x !== path[last - 1].x && path[last - 2].y !== path[last - 1].y) {
        path.splice(last - 1, 0, { x: path[last - 2].x, y: path[last - 1].y });
      }
    }
  }
}

/** 接続ポイントが重なる場合のオフセット量 */
const OVERLAP_OFFSET = 30;

/** 障害物なしの直交パス */
function computeDirectPath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
): Point[] {
  // 始点と終点が重なっている場合、接続辺の方向にオフセットして迂回パスを生成
  if (fromPt.x === toPt.x && fromPt.y === toPt.y) {
    return computeOverlapPath(fromPt, fromSide, toPt, toSide);
  }

  const isHorizontalStart = fromSide === 'left' || fromSide === 'right';
  const isHorizontalEnd = toSide === 'left' || toSide === 'right';

  if (isHorizontalStart && isHorizontalEnd) {
    const midX = (fromPt.x + toPt.x) / 2;
    return [fromPt, { x: midX, y: fromPt.y }, { x: midX, y: toPt.y }, toPt];
  } else if (!isHorizontalStart && !isHorizontalEnd) {
    const midY = (fromPt.y + toPt.y) / 2;
    return [fromPt, { x: fromPt.x, y: midY }, { x: toPt.x, y: midY }, toPt];
  } else if (isHorizontalStart) {
    return [fromPt, { x: toPt.x, y: fromPt.y }, toPt];
  } else {
    return [fromPt, { x: fromPt.x, y: toPt.y }, toPt];
  }
}

/** 始点と終点が重なる場合の迂回パス */
function computeOverlapPath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
): Point[] {
  const d = OVERLAP_OFFSET;
  const fx = fromPt.x;
  const fy = fromPt.y;

  // fromSide の方向にオフセットした中間点を経由して toSide の方向へ戻る
  const fromOffset = sideOffset(fromSide, d);
  const toOffset = sideOffset(toSide, d);

  const p1 = { x: fx + fromOffset.dx, y: fy + fromOffset.dy };
  const p4 = { x: fx + toOffset.dx, y: fy + toOffset.dy };

  // p1 と p4 を直交で接続
  const isFromH = fromSide === 'left' || fromSide === 'right';
  const isToH = toSide === 'left' || toSide === 'right';

  if (isFromH && isToH) {
    // 両方水平: p1→corner→p4
    const cornerY = Math.min(p1.y, p4.y) - d;
    return [fromPt, p1, { x: p1.x, y: cornerY }, { x: p4.x, y: cornerY }, p4, toPt];
  } else if (!isFromH && !isToH) {
    // 両方垂直: p1→corner→p4
    const cornerX = Math.min(p1.x, p4.x) - d;
    return [fromPt, p1, { x: cornerX, y: p1.y }, { x: cornerX, y: p4.y }, p4, toPt];
  } else {
    // 水平+垂直: L字で接続
    return [fromPt, p1, { x: p1.x, y: p4.y }, p4, toPt];
  }
}

function sideOffset(side: Side, d: number): { dx: number; dy: number } {
  switch (side) {
    case 'right': return { dx: d, dy: 0 };
    case 'left': return { dx: -d, dy: 0 };
    case 'bottom': return { dx: 0, dy: d };
    case 'top': return { dx: 0, dy: -d };
  }
}

/**
 * Visibility Graph ベースの直交ルーティング。
 * 4フェーズ（マージン矩形構築、可視グラフ生成、Dijkstra探索、後処理）を統合する。
 */
export function computeVisibilityPath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
  _obstacles: readonly Rect[] = [],
): Point[] {
  return computeDirectPath(fromPt, fromSide, toPt, toSide);
}
