import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { CardLayoutState } from '../types';
import { clusterMembership, subclusterGroups } from './clusterLanes';

/**
 * カード表示のレイアウト（要件書「カード表示（card スキン）」§2.2）。
 *
 * 力学レイアウトを使わず、クラスタ＝カラム・語＝カードの座標を決定的に計算する。乱数・時刻を
 * 使わないため、同一 spec に対して常に同一座標を返す。`.cooc.json` の `layout.positions` は
 * 読まず、書き換えもしない（座標の正はこの純関数）。
 */

/** カードの寸法（世界座標）。頻度は面積でなく数値表示で伝えるため一定にする（要件書 §2.2）。 */
export const CARD_WIDTH = 180;
export const CARD_HEIGHT = 44;
/** カラム内で折り返したレーンどうしの横の余白。 */
export const CARD_GAP_X = 24;
/** カード間の縦の余白。 */
export const CARD_GAP_Y = 12;
/** カラム間の余白。カラムの区切りがカード間の余白と紛れない広さにする。 */
export const CARD_COLUMN_GAP = 72;
/** カラム見出しのために空ける高さ。 */
export const CARD_COLUMN_HEADER_HEIGHT = 40;
/** サブクラスタ見出しのために空ける高さ。 */
export const CARD_SUB_HEADER_HEIGHT = 28;
/**
 * 1 レーンに積むカードの上限行数。超えたらカラム内で右へ折り返す。
 *
 * 折り返さないと、1 カラムに語が集中したとき（知識グラフの偏った種別で実際に起きる）縦に
 * 間延びして他のカラムと比べられない（要件書 §7 pre-mortem）。
 */
export const CARD_MAX_ROWS = 20;

/** サブクラスタ見出しのアンカー（世界座標。テキストの左下）。 */
export interface CardSubHeaderPlacement {
  /** `clusters[i].subclusters` の添字。 */
  subcluster: number;
  x: number;
  y: number;
}

/** カラム 1 本。`cluster` を持たない 1 本が「未分類」カラム（クラスタレーンと同じ規則）。 */
export interface CardColumnPlacement {
  /** `spec.clusters` の添字。未分類カラムでは undefined。 */
  cluster?: number;
  /** このカラムに属する語の添字（表示順 = 頻度降順・同値はラベル順）。 */
  members: readonly number[];
  /** カラム左端（世界座標）。 */
  x: number;
  /** カラム上端（世界座標）。見出しはこの位置を基準に描く。 */
  y: number;
  width: number;
  height: number;
  subHeaders: readonly CardSubHeaderPlacement[];
}

export interface CardLayoutInput {
  file: CooccurrenceFile;
  /** 絞り込み後の表示対象。消えた語はカードを作らず、カラムは詰める（要件書 §2.4）。 */
  visibleNodeIndexes: ReadonlySet<number>;
}

export interface CardLayoutResult {
  /** nodes と同じ長さ。非表示の語は [0,0] のまま（描画側は表示集合でしか参照しない）。 */
  positions: Array<[number, number]>;
  columns: CardColumnPlacement[];
  state: CardLayoutState;
}

/**
 * カラム内の表示順。頻度降順・同値はラベルのコードユニット順・それも同じなら添字順。
 *
 * 最後を添字で切るのは決定性のため。同名ラベルは `.cooc.json` の検証が拒否するが、
 * ここで並びが未定義になる余地を残さない。
 */
function displayOrder(file: CooccurrenceFile, indexes: readonly number[]): number[] {
  return [...indexes].sort((a, b) => {
    const byFrequency = file.spec.nodes[b].frequency - file.spec.nodes[a].frequency;
    if (byFrequency !== 0) return byFrequency;
    const la = file.spec.nodes[a].label;
    const lb = file.spec.nodes[b].label;
    if (la < lb) return -1;
    if (la > lb) return 1;
    return a - b;
  });
}

export function computeCardLayout(input: CardLayoutInput): CardLayoutResult {
  const { file, visibleNodeIndexes } = input;
  const membership = clusterMembership(file);
  const clusters = file.spec.clusters ?? [];

  const columnKeys: (number | undefined)[] = [
    ...Array.from({ length: clusters.length }, (_value, index) => index),
    undefined,
  ];
  const membersByKey = new Map<number | undefined, number[]>(columnKeys.map((key) => [key, []]));
  file.spec.nodes.forEach((_node, index) => {
    if (!visibleNodeIndexes.has(index)) return;
    membersByKey.get(membership[index])?.push(index);
  });

  const positions: Array<[number, number]> = file.spec.nodes.map(() => [0, 0]);
  const columns: CardColumnPlacement[] = [];
  let columnLeft = 0;
  let cardCount = 0;
  let subHeaderCount = 0;
  let hasUnclustered = false;

  for (const key of columnKeys) {
    const members = membersByKey.get(key) ?? [];
    if (members.length === 0) continue;
    if (key === undefined) hasUnclustered = true;

    // 名前付きサブクラスタ + 残余。細分していないクラスタ・未分類は見出しなしの単一グループ。
    const rawGroups =
      key === undefined
        ? []
        : subclusterGroups((clusters[key].subclusters ?? []).map((sub) => sub.members), members);
    const groups = rawGroups.length > 0 ? rawGroups : [{ members }];

    const subHeaders: CardSubHeaderPlacement[] = [];
    const order: number[] = [];
    let lane = 0;
    let rows = 0;
    let y = CARD_COLUMN_HEADER_HEIGHT;
    let maxBottom = y;
    const laneLeft = (): number => columnLeft + lane * (CARD_WIDTH + CARD_GAP_X);
    const newLane = (): void => {
      lane += 1;
      rows = 0;
      y = CARD_COLUMN_HEADER_HEIGHT;
    };

    for (const group of groups) {
      const subcluster = 'subcluster' in group ? group.subcluster : undefined;
      if (subcluster !== undefined) {
        // 見出しがレーンの末尾へ孤立しないよう、見出し + 1 枚が入らなければ先に折り返す。
        if (rows >= CARD_MAX_ROWS) newLane();
        subHeaders.push({ subcluster, x: laneLeft(), y: y + CARD_SUB_HEADER_HEIGHT });
        y += CARD_SUB_HEADER_HEIGHT;
        maxBottom = Math.max(maxBottom, y);
      }
      for (const index of displayOrder(file, group.members)) {
        if (rows >= CARD_MAX_ROWS) newLane();
        positions[index] = [laneLeft() + CARD_WIDTH / 2, y + CARD_HEIGHT / 2];
        order.push(index);
        y += CARD_HEIGHT + CARD_GAP_Y;
        rows += 1;
        maxBottom = Math.max(maxBottom, y);
      }
    }

    const width = (lane + 1) * CARD_WIDTH + lane * CARD_GAP_X;
    columns.push({
      ...(key === undefined ? {} : { cluster: key }),
      members: order,
      x: columnLeft,
      y: 0,
      width,
      height: maxBottom,
      subHeaders,
    });
    columnLeft += width + CARD_COLUMN_GAP;
    cardCount += order.length;
    subHeaderCount += subHeaders.length;
  }

  return {
    positions,
    columns,
    state: {
      columnCount: columns.length,
      cardCount,
      hasUnclustered,
      subHeaderCount,
    },
  };
}

/** エッジの端点（世界座標）と外向きの単位方向。ベジェの制御点はこの方向へ伸ばす。 */
export interface CardLinkAnchor {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * カードの辺の上にエッジの端点を置く（要件書 §2.3）。
 *
 * 横に離れたカードは左右の辺、同じカラム（x がほぼ重なる）のカードは上下の辺で結ぶ。
 * 中心どうしを結ぶとカードの下へ潜り、どのカードから出た線か読めない。
 */
export function cardLinkAnchors(
  source: { x: number; y: number },
  target: { x: number; y: number },
  halfWidth: number,
  halfHeight: number,
): { from: CardLinkAnchor; to: CardLinkAnchor } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) > halfWidth + 1) {
    const sign = dx > 0 ? 1 : -1;
    return {
      from: { x: source.x + sign * halfWidth, y: source.y, dx: sign, dy: 0 },
      to: { x: target.x - sign * halfWidth, y: target.y, dx: -sign, dy: 0 },
    };
  }
  const sign = dy >= 0 ? 1 : -1;
  return {
    from: { x: source.x, y: source.y + sign * halfHeight, dx: 0, dy: sign },
    to: { x: target.x, y: target.y - sign * halfHeight, dx: 0, dy: -sign },
  };
}
