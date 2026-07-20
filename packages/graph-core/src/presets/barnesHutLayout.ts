import type { ForceLayoutOptions, ForceLink, Point } from './layout';

/** 座標キャッシュ無効化用。係数・反復・近似条件を変えたら更新する。 */
export const BARNES_HUT_LAYOUT_ALGORITHM_VERSION = 'barnes-hut-cooccurrence-layout-v1';

/** 円同士に最低限あける余白（px）。既存 forceDirectedLayout と同じ値。 */
const NODE_MARGIN = 16;
const BASE_GRAVITY = 0.5;
const MIN_TEMPERATURE = NODE_MARGIN * 2;
const DEFAULT_ITERATIONS = 45;
const THETA = 1.45;
const EPSILON = 1e-6;

interface QuadNode {
  minX: number;
  minY: number;
  size: number;
  mass: number;
  cx: number;
  cy: number;
  point: number;
  nw: number;
  ne: number;
  sw: number;
  se: number;
}

function createQuad(nodes: QuadNode[], minX: number, minY: number, size: number): number {
  nodes.push({
    minX,
    minY,
    size,
    mass: 0,
    cx: 0,
    cy: 0,
    point: -1,
    nw: -1,
    ne: -1,
    sw: -1,
    se: -1,
  });
  return nodes.length - 1;
}

function childIndex(nodes: QuadNode[], nodeIndex: number, x: number, y: number): number {
  const q = nodes[nodeIndex];
  const half = q.size / 2;
  const east = x >= q.minX + half;
  const south = y >= q.minY + half;
  if (south) {
    if (east) {
      if (q.se < 0) q.se = createQuad(nodes, q.minX + half, q.minY + half, half);
      return q.se;
    }
    if (q.sw < 0) q.sw = createQuad(nodes, q.minX, q.minY + half, half);
    return q.sw;
  }
  if (east) {
    if (q.ne < 0) q.ne = createQuad(nodes, q.minX + half, q.minY, half);
    return q.ne;
  }
  if (q.nw < 0) q.nw = createQuad(nodes, q.minX, q.minY, half);
  return q.nw;
}

function isLeaf(q: QuadNode): boolean {
  return q.nw < 0 && q.ne < 0 && q.sw < 0 && q.se < 0;
}

function insertPoint(nodes: QuadNode[], nodeIndex: number, pointIndex: number, pos: Point[]): void {
  const q = nodes[nodeIndex];
  if (q.mass === 0 && q.point < 0) {
    q.point = pointIndex;
    q.mass = 1;
    q.cx = pos[pointIndex].x;
    q.cy = pos[pointIndex].y;
    return;
  }

  const total = q.mass + 1;
  q.cx = (q.cx * q.mass + pos[pointIndex].x) / total;
  q.cy = (q.cy * q.mass + pos[pointIndex].y) / total;
  q.mass = total;

  if (isLeaf(q)) {
    const existing = q.point;
    q.point = -1;
    if (existing >= 0) insertPoint(nodes, childIndex(nodes, nodeIndex, pos[existing].x, pos[existing].y), existing, pos);
  }
  insertPoint(nodes, childIndex(nodes, nodeIndex, pos[pointIndex].x, pos[pointIndex].y), pointIndex, pos);
}

function buildQuadTree(pos: Point[]): QuadNode[] {
  let minX = pos[0].x;
  let maxX = pos[0].x;
  let minY = pos[0].y;
  let maxY = pos[0].y;
  for (let i = 1; i < pos.length; i++) {
    const p = pos[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1) + 2;
  const nodes: QuadNode[] = [];
  createQuad(nodes, minX - 1, minY - 1, span);
  for (let i = 0; i < pos.length; i++) insertPoint(nodes, 0, i, pos);
  return nodes;
}

/** 初期配置は既存 forceDirectedLayout と同じ。配置戦略を増やさないためここだけ複製する。 */
function initialRing(n: number, spacing: number, groups: number[] | undefined): Point[] {
  const groupOf = (i: number): number => groups?.[i] ?? 0;
  const ids = Array.from(new Set(Array.from({ length: n }, (_, i) => groupOf(i)))).sort((a, b) => a - b);
  const baseRadius = Math.max(spacing, spacing * Math.sqrt(n));
  const pos: Point[] = new Array<Point>(n);
  let placed = 0;
  for (const id of ids) {
    const members: number[] = [];
    for (let i = 0; i < n; i++) if (groupOf(i) === id) members.push(i);
    const sectorStart = (2 * Math.PI * placed) / n;
    const sectorSpan = (2 * Math.PI * members.length) / n;
    const innerSpan = sectorSpan * 0.7;
    const pad = (sectorSpan - innerSpan) / 2;
    const stride = groups ? 1 : coprimeStride(members.length);
    members.forEach((nodeIndex, j) => {
      const slotInGroup = members.length <= 1 ? 0 : (j * stride) % members.length;
      const t = members.length === 1 ? 0.5 : slotInGroup / (members.length - 1);
      const angle = -Math.PI / 2 + sectorStart + pad + innerSpan * t;
      const slot = placed + slotInGroup;
      const radius = baseRadius * (1 + ((slot % 3) - 1) * 0.08);
      pos[nodeIndex] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    placed += members.length;
  }
  return pos;
}

function coprimeStride(n: number): number {
  if (n <= 2) return 1;
  let stride = Math.max(1, Math.floor(n * 0.61803398875));
  while (gcd(stride, n) !== 1) stride++;
  return stride;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

function applyBarnesHutRepulsion(i: number, nodeIndex: number, nodes: QuadNode[], pos: Point[], k: number, disp: Point[]): void {
  const q = nodes[nodeIndex];
  if (q.mass === 0 || (q.mass === 1 && q.point === i)) return;

  let dx = pos[i].x - q.cx;
  let dy = pos[i].y - q.cy;
  let d = Math.hypot(dx, dy);
  if (d < EPSILON) {
    dx = (i + 1) * 1e-3;
    dy = (nodeIndex + 1) * 1e-3;
    d = Math.hypot(dx, dy);
  }

  if (isLeaf(q) || q.size / d < THETA) {
    const force = (k * k * q.mass) / d;
    disp[i].x += (dx / d) * force;
    disp[i].y += (dy / d) * force;
    return;
  }

  if (q.nw >= 0) applyBarnesHutRepulsion(i, q.nw, nodes, pos, k, disp);
  if (q.ne >= 0) applyBarnesHutRepulsion(i, q.ne, nodes, pos, k, disp);
  if (q.sw >= 0) applyBarnesHutRepulsion(i, q.sw, nodes, pos, k, disp);
  if (q.se >= 0) applyBarnesHutRepulsion(i, q.se, nodes, pos, k, disp);
}

function relaxOverlaps(pos: Point[], radii: readonly number[] | undefined, passes: number): void {
  if (!radii) return;
  const maxRadius = radii.reduce((m, r) => Math.max(m, r), 0);
  const cellSize = Math.max(1, maxRadius * 2 + NODE_MARGIN);
  const cells = new Map<string, number[]>();
  for (let i = 0; i < pos.length; i++) {
    const cx = Math.floor(pos[i].x / cellSize);
    const cy = Math.floor(pos[i].y / cellSize);
    const key = `${cx},${cy}`;
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  }
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < pos.length; i++) {
      const cx = Math.floor(pos[i].x / cellSize);
      const cy = Math.floor(pos[i].y / cellSize);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cell = cells.get(`${cx + ox},${cy + oy}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            let dx = pos[i].x - pos[j].x;
            let dy = pos[i].y - pos[j].y;
            let d = Math.hypot(dx, dy);
            if (d < EPSILON) {
              dx = (i + 1) * 1e-3;
              dy = (j + 1) * 1e-3;
              d = Math.hypot(dx, dy);
            }
            const minGap = (radii[i] ?? 0) + (radii[j] ?? 0) + NODE_MARGIN;
            if (d >= minGap) continue;
            const push = (minGap - d + 0.1) / 2;
            const ux = (dx / d) * push;
            const uy = (dy / d) * push;
            pos[i].x += ux;
            pos[i].y += uy;
            pos[j].x -= ux;
            pos[j].y -= uy;
          }
        }
      }
    }
  }
}

/**
 * 共起ネットワーク向けの Barnes-Hut 力学レイアウト。
 *
 * 既存 forceDirectedLayout の力学を踏襲し、全ペア斥力だけを Barnes-Hut 近似へ
 * 置き換える。斥力は語ごとに O(n) 個の寄与が積算されるため、求心力を
 * sqrt(n) で増やして語数増加時の釣り合い点が外へ流れるのを抑える。
 */
export function barnesHutLayout(
  nodeCount: number,
  links: readonly ForceLink[],
  opts: ForceLayoutOptions = {},
): Point[] {
  const { groups, radii, iterations = DEFAULT_ITERATIONS } = opts;
  if (nodeCount <= 0) return [];
  if (nodeCount === 1) return [{ x: 0, y: 0 }];

  const avgDiameter =
    radii && radii.length > 0 ? (radii.reduce((s, r) => s + r, 0) / radii.length) * 2 : 90;
  const k = opts.spacing ?? avgDiameter * 3.2;
  const gravity = BASE_GRAVITY * Math.sqrt(nodeCount / 10);

  const pos = initialRing(nodeCount, k, groups);
  const initialTemp = Math.max(k, k * Math.sqrt(nodeCount) * 0.25);
  const cooling = initialTemp / (iterations + 1);
  const disp: Point[] = Array.from({ length: nodeCount }, () => ({ x: 0, y: 0 }));
  let temp = initialTemp;

  for (let step = 0; step < iterations; step++) {
    for (const d of disp) {
      d.x = 0;
      d.y = 0;
    }

    const tree = buildQuadTree(pos);
    for (let i = 0; i < nodeCount; i++) {
      applyBarnesHutRepulsion(i, 0, tree, pos, k, disp);
    }

    for (const link of links) {
      const a = pos[link.source];
      const b = pos[link.target];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < EPSILON) continue;
      const linkMinGap = (radii?.[link.source] ?? 0) + (radii?.[link.target] ?? 0) + NODE_MARGIN;
      if (d < linkMinGap) continue;
      const force = ((d * d) / k) * link.weight;
      const ux = (dx / d) * force;
      const uy = (dy / d) * force;
      disp[link.source].x -= ux;
      disp[link.source].y -= uy;
      disp[link.target].x += ux;
      disp[link.target].y += uy;
    }

    for (let i = 0; i < nodeCount; i++) {
      disp[i].x -= pos[i].x * gravity;
      disp[i].y -= pos[i].y * gravity;
    }

    for (let i = 0; i < nodeCount; i++) {
      const len = Math.hypot(disp[i].x, disp[i].y);
      if (len < 1e-9) continue;
      const scale = Math.min(len, Math.max(temp, MIN_TEMPERATURE)) / len;
      pos[i].x += disp[i].x * scale;
      pos[i].y += disp[i].y * scale;
    }
    if (step >= iterations - 8) {
      relaxOverlaps(pos, radii, 10);
      relaxOverlaps(pos, radii, 10);
    } else {
      relaxOverlaps(pos, radii, 1);
    }
    temp -= cooling;
  }

  const cx = pos.reduce((s, p) => s + p.x, 0) / nodeCount;
  const cy = pos.reduce((s, p) => s + p.y, 0) / nodeCount;
  return pos.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}
