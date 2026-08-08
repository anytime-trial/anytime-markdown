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

export interface SelectVisibleLabelsInput {
  readonly nodes: readonly RenderNode[];
  readonly viewport: ViewportState;
  readonly measure: LabelMeasure;
  /** canvas の CSS ピクセル幅。画面外のノードを測定前に捨てるのに使う。 */
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
 * 画面外ノードを捨てる余白。横は長いラベルが中心を画面外に置いたまま端だけ見えることがあるため
 * 広めに取る。縦はラベル高さぶんで足りる。
 */
const CULL_MARGIN_X = 240;
const CULL_MARGIN_Y = 40;

/** 重なり判定に使う一様グリッドのセル辺長（画面ピクセル）。ラベル 1 個がおよそ 1〜4 セルに載る。 */
const GRID_CELL = 64;
/** セル座標は余白ぶん負になりうる。非負へ寄せてから 1 次元キーへ畳む。 */
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

/** 画面（＋余白）に入るノードだけを、画面座標付きで頻度の高い順に返す。 */
function screenCandidates(
  nodes: readonly RenderNode[],
  viewport: ViewportState,
  width: number,
  height: number,
): ScreenCandidate[] {
  const candidates: ScreenCandidate[] = [];
  for (const node of nodes) {
    const center = worldToScreen({ x: node.x, y: node.y }, viewport);
    const onScreen = center.x >= -CULL_MARGIN_X && center.x <= width + CULL_MARGIN_X
      && center.y >= -CULL_MARGIN_Y && center.y <= height + CULL_MARGIN_Y;
    if (onScreen) candidates.push({ node, cx: center.x, cy: center.y });
  }
  candidates.sort((a, b) => {
    const byFrequency = b.node.frequency - a.node.frequency;
    return byFrequency !== 0 ? byFrequency : a.node.index - b.node.index;
  });
  return candidates;
}

function scaledWidth(
  cache: LabelWidthCache,
  measure: LabelMeasure,
  text: string,
  fontSize: number,
): number {
  let unit = cache.get(text);
  if (unit === undefined) {
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
 * 1. 画面外のノードを測定前に捨てる
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

  for (const { node, cx, cy } of screenCandidates(nodes, viewport, width, height)) {
    const fontSize = Math.max(10, node.labelFontSize * Math.sqrt(viewport.scale));
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

    if (grid.collides(candidate)) continue;
    selected.push(candidate);
    grid.insert(candidate);
  }

  return selected;
}
