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
