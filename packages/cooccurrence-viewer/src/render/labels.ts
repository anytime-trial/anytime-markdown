import type { RenderNode, ViewportState } from '../types';
import { worldToScreen } from '../viewport/viewport';

export interface LabelBox {
  nodeIndex: number;
  layer: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

/**
 * ラベル 1 個の表示幅を返す。
 *
 * **契約**: {@link selectVisibleLabels} はこれを {@link REFERENCE_FONT_SIZE} でしか呼ばず、
 * 戻り値が font-size に**線形**であることを前提に他のサイズへ比例させる。`fontSize` を
 * 無視する実装（`(text) => text.length * 8` 等）を渡すと、エラーも型エラーも出ないまま
 * 幅が桁違いにずれ、ラベルが重なって描かれる。
 */
export interface LabelMeasure {
  (text: string, fontSize: number): number;
}

/**
 * ラベル文字列 → 「フォント 1px あたりの表示幅」。
 *
 * 呼び出し側（{@link createLabelWidthCache}）がフレームをまたいで保持する。モジュール変数に
 * しないのは、`measure` の実装が違う利用者（テスト・別フォント）どうしが同じ表を共有すると、
 * 誤った幅を静かに使い回すため。
 */
export type LabelWidthCache = Map<string, number>;

export function createLabelWidthCache(): LabelWidthCache {
  return new Map();
}

/**
 * 文字幅キャッシュの上限。超えたら全消しして測り直す（次の 1 フレームだけ `measureText` が
 * 走る）。ビューアはグラフを差し替えても同じスケジューラを使い回すため、上限が無いと
 * 表示件数や種別を切り替えるたびに過去のグラフの語彙が積み上がる。1 グラフの上限は
 * 10,000 ノードなので、2 グラフぶんを保持できる大きさにしてある。
 */
const WIDTH_CACHE_MAX_ENTRIES = 20_000;

export interface SelectVisibleLabelsInput {
  readonly nodes: readonly RenderNode[];
  readonly viewport: ViewportState;
  /** 基準サイズでのみ呼ばれ、戻り値は font-size に線形と仮定される（{@link LabelMeasure}）。 */
  readonly measure: LabelMeasure;
  /** canvas の CSS ピクセル幅。画面外のノードを捨てるのに使う。 */
  readonly width: number;
  /** canvas の CSS ピクセル高さ。 */
  readonly height: number;
  readonly padding?: number;
  /** フレームをまたぐ文字幅キャッシュ。省略時は毎回作り直す（正しいが遅い）。 */
  readonly widthCache?: LabelWidthCache | undefined;
}

const DEFAULT_PADDING = 4;

/**
 * 文字幅を測る基準フォントサイズ。実サイズはズームのたびに変わるため、基準サイズで 1 度だけ
 * 測って比例させる。`measureText` の幅は同一フォントファミリなら font-size に線形なので、
 * 拡大率倍で求めた幅と直接測った幅の差はサブピクセルにとどまる（重なり回避の用途には十分）。
 */
const REFERENCE_FONT_SIZE = 100;

/**
 * 測定前の粗い横方向カリング幅（canvas 幅の何倍を左右に足すか）。
 *
 * ラベルは中心揃えで描かれるため、中心が画面外でも文字の一部が画面内に入りうる。ここで
 * 落とすのは「幅を測るまでもなく画面に掛からない」ノードだけで、**実際に画面へ掛かるかの
 * 判定は幅を求めた後に厳密に行う**（`selectVisibleLabels` の後段）。粗い側で余白を狭く取ると、
 * 長いラベルが画面に食い込んでいるのに捨てられる（実測: 53 文字・幅 1,057px のラベルが
 * 中心 x=-250 で 279px ぶん画面に出るのに、固定 240px 余白では落ちていた）。
 */
const COARSE_CULL_WIDTH_FACTOR = 1;

/** 重なり判定に使う一様グリッドのセル辺長（画面ピクセル）。ラベル 1 個がおよそ 1〜4 セルに載る。 */
const GRID_CELL = 64;
/**
 * セル座標を 1 次元キーへ畳む定数。
 *
 * Why not `|col| >= GRID_INDEX_OFFSET` でのエイリアスを塞がないか: **正しさはこの定数に
 * 依存していない**。重なる 2 つの箱は必ず同じセルを共有し、同じ写像を通れば同じキーへ落ちる
 * ので取りこぼしは起きない。エイリアスで別位置の箱が同じバケットへ入っても、最終判定は
 * `boxesOverlap` が厳密に行うため誤検出にもならず、比較が数回増えるだけである。
 * カリング後の座標は |col| <= (width * (1 + 2 * COARSE_CULL_WIDTH_FACTOR)) / GRID_CELL に収まる。
 */
const GRID_INDEX_OFFSET = 4096;
const GRID_STRIDE = 8192;

export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function cellKey(col: number, row: number): number {
  return (row + GRID_INDEX_OFFSET) * GRID_STRIDE + (col + GRID_INDEX_OFFSET);
}

interface LabelGrid {
  /** 既に採ったラベルと重なるか。跨るセルだけを見る。 */
  collides(box: LabelBox): boolean;
  insert(box: LabelBox): void;
}

function createLabelGrid(): LabelGrid {
  const cells = new Map<number, LabelBox[]>();

  const eachCell = (box: LabelBox, visit: (key: number) => boolean | void): boolean => {
    const colFrom = Math.floor(box.x / GRID_CELL);
    const colTo = Math.floor((box.x + box.width) / GRID_CELL);
    const rowFrom = Math.floor(box.y / GRID_CELL);
    const rowTo = Math.floor((box.y + box.height) / GRID_CELL);
    for (let col = colFrom; col <= colTo; col += 1) {
      for (let row = rowFrom; row <= rowTo; row += 1) {
        if (visit(cellKey(col, row)) === true) return true;
      }
    }
    return false;
  };

  return {
    collides(box) {
      return eachCell(box, (key) => cells.get(key)?.some((other) => boxesOverlap(other, box)) === true);
    },
    insert(box) {
      eachCell(box, (key) => {
        const bucket = cells.get(key);
        if (bucket === undefined) cells.set(key, [box]);
        else bucket.push(box);
      });
    },
  };
}

interface ScreenCandidate {
  readonly node: RenderNode;
  readonly cx: number;
  readonly cy: number;
}

/**
 * 幅を測るまでもなく画面へ掛からないノードを落とし、残りを頻度の高い順に返す。
 *
 * 縦は箱の高さが文字列に依らない（font-size ＋ padding）ため、ここで**厳密に**判定できる。
 * 横は幅が文字列依存なので粗い判定にとどめ、確定判定は幅を求めた後に行う。
 */
function screenCandidates(
  nodes: readonly RenderNode[],
  viewport: ViewportState,
  width: number,
  height: number,
  padding: number,
): ScreenCandidate[] {
  const coarseMarginX = width * COARSE_CULL_WIDTH_FACTOR;
  const candidates: ScreenCandidate[] = [];
  for (const node of nodes) {
    const center = worldToScreen({ x: node.x, y: node.y }, viewport);
    if (center.x < -coarseMarginX || center.x > width + coarseMarginX) continue;
    const halfHeight = (labelFontSize(node, viewport) + padding * 2) / 2;
    if (center.y + halfHeight < 0 || center.y - halfHeight > height) continue;
    candidates.push({ node, cx: center.x, cy: center.y });
  }
  candidates.sort((a, b) => {
    const byFrequency = b.node.frequency - a.node.frequency;
    return byFrequency !== 0 ? byFrequency : a.node.index - b.node.index;
  });
  return candidates;
}

function labelFontSize(node: RenderNode, viewport: ViewportState): number {
  return Math.max(10, node.labelFontSize * Math.sqrt(viewport.scale));
}

function scaledWidth(
  cache: LabelWidthCache,
  measure: LabelMeasure,
  text: string,
  fontSize: number,
): number {
  let unit = cache.get(text);
  if (unit === undefined) {
    if (cache.size >= WIDTH_CACHE_MAX_ENTRIES) cache.clear();
    unit = measure(text, REFERENCE_FONT_SIZE) / REFERENCE_FONT_SIZE;
    cache.set(text, unit);
  }
  return unit * fontSize;
}

/**
 * 重ならないラベルを頻度の高い順に選ぶ。
 *
 * Why not 素直に「全ノードを測って、採用済み集合を線形走査して重なりを見る」か: 出力は画面に
 * 載る数百件で頭打ちなのに、その実装は入力（ノード総数）に比例して伸びる。実測（2026-08-08・
 * 実データ・1400x900）で 10,000 ノード時 14.1ms を消費し、1 フレーム 22.1ms の 7 割を占めていた。
 * うち 12.6ms は全ノードへの `measureText` である。本実装は次の 3 点でコストを「画面に映って
 * いる量」へ寄せる。同条件の実測で 10,000 ノード 2.0ms・30,000 ノード 3.6ms。
 *
 * 1. 画面へ掛からないノードを落とす（縦は測定前に厳密に、横は幅を求めた後に厳密に）
 * 2. 重なり判定を採用済み集合の線形走査から一様グリッドへ
 * 3. 文字幅を基準サイズで 1 度だけ測り、フレームをまたいでキャッシュする
 *
 * 副作用として、画面外ノードが画面内ノードのラベル位置を奪わなくなるため、端の近くで表示
 * されるラベルが以前より増えることがある（描かれない語が枠だけ取っていた状態の解消）。
 */
export function selectVisibleLabels(input: SelectVisibleLabelsInput): LabelBox[] {
  const { nodes, viewport, measure, width, height } = input;
  const padding = input.padding ?? DEFAULT_PADDING;
  const cache = input.widthCache ?? createLabelWidthCache();

  const grid = createLabelGrid();
  const selected: LabelBox[] = [];

  for (const { node, cx, cy } of screenCandidates(nodes, viewport, width, height, padding)) {
    const fontSize = labelFontSize(node, viewport);
    const boxWidth = scaledWidth(cache, measure, node.label, fontSize) + padding * 2;
    const boxHeight = fontSize + padding * 2;
    const candidate: LabelBox = {
      nodeIndex: node.index,
      layer: node.layer,
      text: node.label,
      x: cx - boxWidth / 2,
      y: cy - boxHeight / 2,
      width: boxWidth,
      height: boxHeight,
      fontSize,
    };

    // 幅が決まって初めて「文字が画面に掛かるか」を厳密に言える。ラベルは中心揃えなので、
    // 中心が画面外でも半幅ぶんは画面に出る（長いラベルほどこの差が大きい）。
    if (candidate.x + boxWidth < 0 || candidate.x > width) continue;

    if (grid.collides(candidate)) continue;
    selected.push(candidate);
    grid.insert(candidate);
  }

  return selected;
}
