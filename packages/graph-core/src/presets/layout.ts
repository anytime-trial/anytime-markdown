/**
 * 思考法ダイアグラム用の純粋な座標計算ヘルパー群。
 *
 * いずれも入力（要素数・寸法オプション）から決定的に座標を返す純関数で、
 * DOM・乱数・時刻に依存しない。プリセット（`presets/*`）が GraphNode の
 * x/y/width/height を確定するために利用する。
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 抽象度ピラミッドの台形段を上→下に積む。
 * 上段ほど幅が狭く、下段ほど広い（widen downward）。各段は水平中央揃え。
 */
export function pyramidTiers(
  count: number,
  opts: {
    topWidth?: number;
    bottomWidth?: number;
    tierHeight?: number;
    gap?: number;
    centerX?: number;
    originY?: number;
  } = {},
): Rect[] {
  const {
    topWidth = 160,
    bottomWidth = 520,
    tierHeight = 80,
    gap = 12,
    centerX = 0,
    originY = 0,
  } = opts;
  if (count <= 0) return [];
  const rects: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const width = topWidth + (bottomWidth - topWidth) * t;
    const y = originY + i * (tierHeight + gap);
    rects.push({ x: centerX - width / 2, y, width, height: tierHeight });
  }
  return rects;
}

/**
 * 行 × 列のグリッドセルを返す（行優先）。index = row * cols + col。
 * SWOT（2×2）・モルフォロジカルボックスに利用。
 */
export function gridCells(
  rows: number,
  cols: number,
  opts: {
    cellWidth?: number;
    cellHeight?: number;
    gap?: number;
    originX?: number;
    originY?: number;
  } = {},
): Rect[] {
  const { cellWidth = 240, cellHeight = 160, gap = 16, originX = 0, originY = 0 } = opts;
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: originX + c * (cellWidth + gap),
        y: originY + r * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return cells;
}

/**
 * 円周上に n 点を等間隔配置する。0 番目は真上（-90°）から時計回り。
 * 因果ループ図（CLD）のノード配置に利用。
 */
export function ringPoints(
  n: number,
  opts: { radius?: number; centerX?: number; centerY?: number } = {},
): Point[] {
  const { radius = 220, centerX = 0, centerY = 0 } = opts;
  if (n <= 0) return [];
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    pts.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  return pts;
}

/**
 * 縦（または横）方向の連鎖（チェーン）配置。なぜなぜ分析・帰結チェーンに利用。
 * direction 'vertical' は上→下、'horizontal' は左→右。
 */
export function chainPositions(
  n: number,
  opts: {
    nodeWidth?: number;
    nodeHeight?: number;
    gap?: number;
    direction?: 'vertical' | 'horizontal';
    originX?: number;
    originY?: number;
  } = {},
): Rect[] {
  const {
    nodeWidth = 280,
    nodeHeight = 64,
    gap = 48,
    direction = 'vertical',
    originX = 0,
    originY = 0,
  } = opts;
  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    if (direction === 'vertical') {
      rects.push({ x: originX, y: originY + i * (nodeHeight + gap), width: nodeWidth, height: nodeHeight });
    } else {
      rects.push({ x: originX + i * (nodeWidth + gap), y: originY, width: nodeWidth, height: nodeHeight });
    }
  }
  return rects;
}

export interface FishboneBone {
  /** 背骨上の接続点 */
  attach: Point;
  /** カテゴリ見出しの配置点（背骨から離れた骨の先端） */
  label: Point;
  /** 背骨より上に伸びるか */
  above: boolean;
}

export interface FishboneGeometry {
  spine: { from: Point; to: Point };
  /** 問題（頭）の配置点。背骨の右端 */
  head: Point;
  bones: FishboneBone[];
}

/**
 * 特性要因図（フィッシュボーン）の骨格座標を計算する。
 * 背骨は水平。頭（問題）は右端。カテゴリの骨は背骨に沿って左から並び、
 * 上下交互（even=上 / odd=下）に斜めに伸ばす。
 */
export function fishboneGeometry(
  categoryCount: number,
  opts: {
    spineLength?: number;
    branchRise?: number;
    branchRun?: number;
    centerY?: number;
    originX?: number;
  } = {},
): FishboneGeometry {
  const {
    spineLength = 640,
    branchRise = 150,
    branchRun = 90,
    centerY = 0,
    originX = 0,
  } = opts;
  const tailX = originX;
  const headX = originX + spineLength;
  const spine = {
    from: { x: tailX, y: centerY },
    to: { x: headX, y: centerY },
  };
  const bones: FishboneBone[] = [];
  // 骨は背骨の [10%, 85%] 区間に等間隔で接続する（頭側に寄せすぎない）
  const startX = tailX + spineLength * 0.12;
  const endX = tailX + spineLength * 0.85;
  for (let i = 0; i < categoryCount; i++) {
    const t = categoryCount === 1 ? 0.5 : i / (categoryCount - 1);
    const ax = startX + (endX - startX) * t;
    const above = i % 2 === 0;
    const dir = above ? -1 : 1;
    bones.push({
      attach: { x: ax, y: centerY },
      label: { x: ax - branchRun, y: centerY + dir * branchRise },
      above,
    });
  }
  return { spine, head: { x: headX, y: centerY }, bones };
}

export interface TreeInput {
  id: string;
  children?: TreeInput[];
}

/**
 * tidy なツリーレイアウト。各ノードに座標（ノード矩形の左上）を割り当てる。
 * direction 'LR' は左→右に深さが進む（ロジック/イシューツリー）、
 * 'TB' は上→下（組織図的）。葉を順に並べ、親は子の中央に置く。
 */
export function tidyTreeLayout(
  root: TreeInput,
  opts: {
    nodeWidth?: number;
    nodeHeight?: number;
    levelGap?: number;
    siblingGap?: number;
    direction?: 'LR' | 'TB';
    originX?: number;
    originY?: number;
  } = {},
): Map<string, Rect> {
  const {
    nodeWidth = 200,
    nodeHeight = 56,
    levelGap = 90,
    siblingGap = 24,
    direction = 'LR',
    originX = 0,
    originY = 0,
  } = opts;
  const result = new Map<string, Rect>();
  // cross 軸（LR では y、TB では x）に沿った葉カウンタ
  let crossCursor = 0;
  const crossExtent = direction === 'LR' ? nodeHeight : nodeWidth;
  const crossGap = siblingGap;

  // 戻り値: そのサブツリーの cross 軸中心位置
  const walk = (node: TreeInput, depth: number): number => {
    const mainPos = depth * (direction === 'LR' ? nodeWidth + levelGap : nodeHeight + levelGap);
    const children = node.children ?? [];
    let center: number;
    if (children.length === 0) {
      center = crossCursor + crossExtent / 2;
      crossCursor += crossExtent + crossGap;
    } else {
      const childCenters = children.map((c) => walk(c, depth + 1));
      center = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    }
    if (direction === 'LR') {
      result.set(node.id, {
        x: originX + mainPos,
        y: originY + center - nodeHeight / 2,
        width: nodeWidth,
        height: nodeHeight,
      });
    } else {
      result.set(node.id, {
        x: originX + center - nodeWidth / 2,
        y: originY + mainPos,
        width: nodeWidth,
        height: nodeHeight,
      });
    }
    return center;
  };

  walk(root, 0);
  return result;
}

/**
 * マインドマップの放射配置。中心ノードの周囲に第1階層ブランチを円状に配置し、
 * 各ブランチ配下の子は同方向へさらに外側へ伸ばす。
 * 戻り値はブランチ index ごとの { angle(rad), base(Point), leafStep(Point) }。
 */
export function radialBranches(
  branchCount: number,
  opts: { radius?: number; centerX?: number; centerY?: number } = {},
): Array<{ angle: number; base: Point; outward: Point }> {
  const { radius = 240, centerX = 0, centerY = 0 } = opts;
  if (branchCount <= 0) return [];
  const out: Array<{ angle: number; base: Point; outward: Point }> = [];
  for (let i = 0; i < branchCount; i++) {
    const angle = (2 * Math.PI * i) / branchCount - Math.PI / 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    out.push({
      angle,
      base: { x: centerX + radius * ux, y: centerY + radius * uy },
      outward: { x: ux, y: uy },
    });
  }
  return out;
}

/**
 * 重み付き要素を左右2グループへ均等配分する。重み降順に貪欲に
 * 「現在の累計が小さい側」へ割り当てる。戻り値は入力 index 順の
 * boolean 配列（true=右 / false=左）。決定的（同重みは index 安定、
 * タイは右を優先）。FreeMind 風マインドマップの左右ブランチ分割に利用。
 */
export function partitionBalanced(weights: number[]): boolean[] {
  const sides = new Array<boolean>(weights.length).fill(true);
  const order = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w || a.i - b.i);
  let right = 0;
  let left = 0;
  for (const { w, i } of order) {
    if (right <= left) {
      sides[i] = true;
      right += w;
    } else {
      sides[i] = false;
      left += w;
    }
  }
  return sides;
}

/** 円同士に最低限あける余白（px）。これを割り込むと追加の斥力が働く。 */
const NODE_MARGIN = 16;

export interface ForceLink {
  /** ノード添字（0-based） */
  source: number;
  /** ノード添字（0-based） */
  target: number;
  /** 結合の強さ。大きいほど強く引き合う（共起強度をそのまま渡す） */
  weight: number;
}

export interface ForceLayoutOptions {
  /**
   * ノードごとのグループ番号。指定すると同グループが初期リングの同一扇形へ集まり、
   * クラスタが図の上でもまとまりやすくなる。
   */
  groups?: number[];
  /** ノード半径。指定すると大きい円ほど強く反発し、重なりを避ける。 */
  radii?: number[];
  /** 反復回数。既定値は固定で、呼び出しごとにぶれない。 */
  iterations?: number;
  /**
   * 結合したノード間の目標距離（中心間）。既定はノード径から導出するため、
   * 円が大きい図ほど自動的に広がり、小さい図は詰まる。
   */
  spacing?: number;
}

/** 初期配置: グループごとに扇形を割り当て、その内側へ均等に並べる。 */
function initialRing(n: number, spacing: number, groups: number[] | undefined): Point[] {
  const groupOf = (i: number): number => groups?.[i] ?? 0;
  const ids = Array.from(new Set(Array.from({ length: n }, (_, i) => groupOf(i)))).sort((a, b) => a - b);
  // 隣接ノードが目標距離だけ離れる円周長から半径を決める
  const baseRadius = Math.max(spacing, (spacing * n) / (2 * Math.PI));
  const pos: Point[] = new Array<Point>(n);
  let placed = 0;
  for (const id of ids) {
    const members: number[] = [];
    for (let i = 0; i < n; i++) if (groupOf(i) === id) members.push(i);
    const sectorStart = (2 * Math.PI * placed) / n;
    const sectorSpan = (2 * Math.PI * members.length) / n;
    // 扇形の 70% だけを使い、グループ間に隙間を残す
    const innerSpan = sectorSpan * 0.7;
    const pad = (sectorSpan - innerSpan) / 2;
    members.forEach((nodeIndex, j) => {
      const t = members.length === 1 ? 0.5 : j / (members.length - 1);
      const angle = -Math.PI / 2 + sectorStart + pad + innerSpan * t;
      // 完全な対称配置は斥力が釣り合って動かなくなるため、半径を決定的に僅かにずらす
      const slot = placed + j;
      const radius = baseRadius * (1 + ((slot % 3) - 1) * 0.08);
      pos[nodeIndex] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    placed += members.length;
  }
  return pos;
}

/**
 * 力学モデル（Fruchterman–Reingold 系）でノード座標を解く。
 *
 * 乱数・時刻・DOM を使わず、初期配置と反復回数を固定しているため、
 * 同一入力は常に同一座標を返す（他のレイアウト関数と同じ決定論性）。
 * 返る座標は重心が原点になるよう正規化される。
 */
export function forceDirectedLayout(
  nodeCount: number,
  links: readonly ForceLink[],
  opts: ForceLayoutOptions = {},
): Point[] {
  const { groups, radii, iterations = 300 } = opts;
  if (nodeCount <= 0) return [];
  if (nodeCount === 1) return [{ x: 0, y: 0 }];

  // 目標距離 k。円の平均直径の 1.6 倍を既定にすると、結合ペアが円 1 個ぶん程度の
  // 間隔で並び、共起ネットワークとして読める密度になる。
  const avgDiameter =
    radii && radii.length > 0 ? (radii.reduce((s, r) => s + r, 0) / radii.length) * 2 : 90;
  const k = opts.spacing ?? avgDiameter * 1.6;

  const pos = initialRing(nodeCount, k, groups);
  const cooling = k / (iterations + 1);
  const disp: Point[] = Array.from({ length: nodeCount }, () => ({ x: 0, y: 0 }));
  let temp = k;

  for (let step = 0; step < iterations; step++) {
    for (const d of disp) {
      d.x = 0;
      d.y = 0;
    }

    // 斥力: 全ペアが反発する。半径ぶんを差し引くことで大きい円ほど離れる。
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          // 完全一致は方向が定まらないので、添字から決定的な微小オフセットを与える
          dx = (i + 1) * 1e-3;
          dy = (j + 1) * 1e-3;
          d = Math.hypot(dx, dy);
        }
        // 古典的な Fruchterman–Reingold の斥力。距離に反比例するため遠方では弱い。
        let force = (k * k) / d;
        // 円が重なる距離まで近づいたときだけ、追加で強く押し戻す
        const minGap = (radii?.[i] ?? 0) + (radii?.[j] ?? 0) + NODE_MARGIN;
        if (d < minGap) force += (minGap - d) * k;
        const ux = (dx / d) * force;
        const uy = (dy / d) * force;
        disp[i].x += ux;
        disp[i].y += uy;
        disp[j].x -= ux;
        disp[j].y -= uy;
      }
    }

    // 引力: 結合されたペアが weight に比例して引き合う
    for (const link of links) {
      const a = pos[link.source];
      const b = pos[link.target];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const force = ((d * d) / k) * link.weight;
      const ux = (dx / d) * force;
      const uy = (dy / d) * force;
      disp[link.source].x -= ux;
      disp[link.source].y -= uy;
      disp[link.target].x += ux;
      disp[link.target].y += uy;
    }

    // 変位を温度で頭打ちにして適用（振動を抑えつつ徐々に収束させる）
    for (let i = 0; i < nodeCount; i++) {
      const len = Math.hypot(disp[i].x, disp[i].y);
      if (len < 1e-9) continue;
      const scale = Math.min(len, temp) / len;
      pos[i].x += disp[i].x * scale;
      pos[i].y += disp[i].y * scale;
    }
    temp -= cooling;
  }

  // 重心を原点へ
  const cx = pos.reduce((s, p) => s + p.x, 0) / nodeCount;
  const cy = pos.reduce((s, p) => s + p.y, 0) / nodeCount;
  return pos.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}
