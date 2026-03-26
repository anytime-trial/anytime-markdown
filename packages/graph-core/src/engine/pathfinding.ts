import type { Side } from './connector';

interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }

/** A*グリッドベースの障害物回避ルーティング */
export function computeAvoidancePath(
  fromPt: Point,
  fromSide: Side,
  toPt: Point,
  toSide: Side,
  obstacles: Rect[],
  gridSize: number = 20,
): Point[] {
  if (obstacles.length === 0) {
    return computeDirectPath(fromPt, fromSide, toPt, toSide);
  }

  const margin = gridSize * 3;

  // グリッド範囲を算出
  const allX = [fromPt.x, toPt.x, ...obstacles.flatMap(o => [o.x, o.x + o.width])];
  const allY = [fromPt.y, toPt.y, ...obstacles.flatMap(o => [o.y, o.y + o.height])];
  const minX = Math.min(...allX) - margin;
  const minY = Math.min(...allY) - margin;
  const maxX = Math.max(...allX) + margin;
  const maxY = Math.max(...allY) + margin;

  const cols = Math.ceil((maxX - minX) / gridSize) + 1;
  const rows = Math.ceil((maxY - minY) / gridSize) + 1;

  // グリッド上の座標変換
  const toGrid = (p: Point): [number, number] => [
    Math.round((p.x - minX) / gridSize),
    Math.round((p.y - minY) / gridSize),
  ];
  const toWorld = (col: number, row: number): Point => ({
    x: minX + col * gridSize,
    y: minY + row * gridSize,
  });

  // 障害物マップ（padding付き）
  const blocked = new Set<string>();
  const pad = 1; // グリッドセル単位のパディング
  for (const o of obstacles) {
    const [oMinC, oMinR] = toGrid({ x: o.x, y: o.y });
    const [oMaxC, oMaxR] = toGrid({ x: o.x + o.width, y: o.y + o.height });
    for (let c = oMinC - pad; c <= oMaxC + pad; c++) {
      for (let r = oMinR - pad; r <= oMaxR + pad; r++) {
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          blocked.add(`${c},${r}`);
        }
      }
    }
  }

  const [startC, startR] = toGrid(fromPt);
  const [endC, endR] = toGrid(toPt);

  // start/endは通過可能にする
  blocked.delete(`${startC},${startR}`);
  blocked.delete(`${endC},${endR}`);

  // A*探索
  const path = astar(startC, startR, endC, endR, cols, rows, blocked);

  if (!path) {
    // 探索失敗 → 直線フォールバック
    return computeDirectPath(fromPt, fromSide, toPt, toSide);
  }

  // グリッド座標 → ワールド座標に変換
  const worldPath = path.map(([c, r]) => toWorld(c, r));

  // 始点と終点を正確な座標に置換
  worldPath[0] = fromPt;
  worldPath[worldPath.length - 1] = toPt;

  // 冗長な中間点を除去（同じ方向のセグメントを統合 + 階段パターンをL字に変換）
  const simplified = collapseStaircase(simplifyPath(worldPath), obstacles);

  // 始点/終点に辺と垂直なマージンセグメントを挿入
  // これにより、コネクタはノード辺に対して必ず垂直に接続する
  ensurePerpendicularEntry(simplified, fromPt, fromSide, toPt, toSide, gridSize);

  return simplified;
}

/** 障害物なしの直交パス */
function computeDirectPath(fromPt: Point, fromSide: Side, toPt: Point, toSide: Side): Point[] {
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

/** バイナリ最小ヒープ（A*探索用） */
class MinHeap {
  private data: { key: string; c: number; r: number; g: number; f: number }[] = [];

  get size() { return this.data.length; }

  push(item: { key: string; c: number; r: number; g: number; f: number }) {
    this.data.push(item);
    this._siftUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  private _siftUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private _siftDown(i: number) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

/** A* 探索（直交移動のみ） */
function astar(
  startC: number, startR: number,
  endC: number, endR: number,
  cols: number, rows: number,
  blocked: Set<string>,
): [number, number][] | null {
  const key = (c: number, r: number) => `${c},${r}`;
  const heuristic = (c: number, r: number) => Math.abs(c - endC) + Math.abs(r - endR);

  const openHeap = new MinHeap();
  const openKeys = new Set<string>();
  const closedKeys = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  const startKey = key(startC, startR);
  const endKey = key(endC, endR);
  openHeap.push({ key: startKey, c: startC, r: startR, g: 0, f: heuristic(startC, startR) });
  openKeys.add(startKey);
  gScore.set(startKey, 0);

  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  let iterations = 0;
  const maxIterations = cols * rows * 2; // 安全弁

  while (openHeap.size > 0 && iterations < maxIterations) {
    iterations++;

    // 最小 f のノードを取得（O(log n)）
    const current = openHeap.pop()!;
    const bestKey = current.key;

    // ヒープに残った古いエントリをスキップ（より良いパスで既に処理済み）
    if (closedKeys.has(bestKey)) continue;
    closedKeys.add(bestKey);
    openKeys.delete(bestKey);

    if (bestKey === endKey) {
      // パスを再構築
      const path: [number, number][] = [[endC, endR]];
      let k = endKey;
      while (cameFrom.has(k)) {
        k = cameFrom.get(k)!;
        const [c, r] = k.split(',').map(Number);
        path.unshift([c, r]);
      }
      return path;
    }

    for (const [dc, dr] of dirs) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nk = key(nc, nr);
      if (blocked.has(nk) || closedKeys.has(nk)) continue;

      const tentG = current.g + 1;
      if (tentG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentG);
        cameFrom.set(nk, bestKey);
        openHeap.push({ key: nk, c: nc, r: nr, g: tentG, f: tentG + heuristic(nc, nr) });
        openKeys.add(nk);
      }
    }
  }

  return null; // パスが見つからない
}

/**
 * 始点/終点の最初/最後のセグメントが辺と垂直になるよう補正する。
 *
 * 隣接点の座標を揃えつつ、その先の点との間で斜め線が発生する場合は
 * コーナー点を挿入して直交性を維持する。
 */
function ensurePerpendicularEntry(
  path: Point[], fromPt: Point, fromSide: Side, toPt: Point, toSide: Side, _margin: number,
): void {
  if (path.length < 3) return;

  const isFromHorizontal = fromSide === 'right' || fromSide === 'left';

  // 始点側
  if (isFromHorizontal ? path[1].y !== fromPt.y : path[1].x !== fromPt.x) {
    const oldP1 = path[1];
    if (isFromHorizontal) {
      // path[1] の y を揃えて水平にする
      path[1] = { x: oldP1.x, y: fromPt.y };
      // path[1]→path[2] が斜めになったらコーナーを挿入
      if (path.length > 2 && path[2].x !== path[1].x && path[2].y !== path[1].y) {
        path.splice(2, 0, { x: path[1].x, y: path[2].y });
      }
    } else {
      // path[1] の x を揃えて垂直にする
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

/** 同方向の連続セグメントを統合して冗長なウェイポイントを除去 */
function simplifyPath(path: Point[]): Point[] {
  if (path.length <= 2) return path;

  const result: Point[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = path[i];
    const next = path[i + 1];
    // prev→curr と curr→next が同方向なら curr をスキップ
    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;
    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

/** 線分が矩形と交差するか判定 */
function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect, padding: number = 2): boolean {
  const rMinX = rect.x - padding;
  const rMinY = rect.y - padding;
  const rMaxX = rect.x + rect.width + padding;
  const rMaxY = rect.y + rect.height + padding;

  // 水平線分
  if (p1.y === p2.y) {
    const y = p1.y;
    if (y < rMinY || y > rMaxY) return false;
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    return maxX > rMinX && minX < rMaxX;
  }
  // 垂直線分
  if (p1.x === p2.x) {
    const x = p1.x;
    if (x < rMinX || x > rMaxX) return false;
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    return maxY > rMinY && minY < rMaxY;
  }
  return false;
}

/** L字パスが障害物と交差しないか確認 */
function lPathClear(start: Point, bend: Point, end: Point, obstacles: Rect[]): boolean {
  for (const o of obstacles) {
    if (segmentIntersectsRect(start, bend, o) || segmentIntersectsRect(bend, end, o)) {
      return false;
    }
  }
  return true;
}

/**
 * 階段パターン（水平→垂直→水平→垂直...）をL字パスに統合。
 * A* は直交移動のみのため、斜め方向の目的地へは階段状のパスを生成する。
 * この関数は連続する階段セグメントを検出し、障害物に衝突しない場合
 * 始点と終点を結ぶL字（1回折れ）に置換する。
 */
function collapseStaircase(path: Point[], obstacles: Rect[]): Point[] {
  if (path.length <= 3) return path;

  const result: Point[] = [path[0]];
  let i = 0;

  while (i < path.length - 1) {
    // i から始まる階段パターンの末端を探す
    let j = i + 2;
    while (j < path.length) {
      const segStart = path[j - 1];
      const segEnd = path[j];
      // 直交セグメント（水平 or 垂直）でなければ階段終了
      if (segStart.x !== segEnd.x && segStart.y !== segEnd.y) break;
      j++;
    }
    // j-1 が階段の末端（i から j-1 までが階段候補）
    const stairLen = j - 1 - i;

    if (stairLen >= 3) {
      // 階段パターン検出: L字に統合を試みる
      const start = path[i];
      const end = path[j - 1];

      // L字の候補は2つ: 水平→垂直 or 垂直→水平
      const bend1: Point = { x: end.x, y: start.y };
      const bend2: Point = { x: start.x, y: end.y };

      if (lPathClear(start, bend1, end, obstacles)) {
        result.push(bend1);
        result.push(end);
        i = j - 1;
      } else if (lPathClear(start, bend2, end, obstacles)) {
        result.push(bend2);
        result.push(end);
        i = j - 1;
      } else {
        // L字が障害物に衝突 → 元のパスを保持
        i++;
        result.push(path[i]);
      }
    } else {
      i++;
      result.push(path[i]);
    }
  }

  return result;
}
