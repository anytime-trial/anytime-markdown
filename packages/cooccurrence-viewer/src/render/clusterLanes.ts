import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { LayerAxis } from '../types';

/**
 * クラスタレーンの配置（要件書「クラスタレーン表示」§2.1〜§2.4）。
 *
 * レイアウトは全体に対して 1 回だけ計算したものをそのまま使い、**クラスタ軸方向にだけ**平行
 * 移動する。レイアウトを再計算しないため、座標キャッシュもレイアウトアルゴリズム版数も動かない。
 *
 * スライス軸方向の座標を動かさないのは、レイヤー間の点線が軸に平行であることを保つためである
 * （機能仕様書 §3.6.3）。両方の軸を動かすと、同じ語がレイヤーごとに別の位置へ現れ、点線が図を
 * 斜めに横切る。
 */

/**
 * 語ごとのクラスタ番号。どのクラスタの `members` にも入らない語は `undefined`。
 *
 * 同じ語を 2 つのクラスタが持つときは先に現れたクラスタが勝つ。後勝ちにすると、語がどのレーンへ
 * 行くかがクラスタの並べ替えで変わる。
 */
export function clusterMembership(file: CooccurrenceFile): (number | undefined)[] {
  const membership = new Array<number | undefined>(file.spec.nodes.length).fill(undefined);
  file.spec.clusters?.forEach((cluster, clusterIndex) => {
    cluster.members.forEach((member) => {
      if (member < 0 || member >= membership.length) return;
      if (membership[member] === undefined) membership[member] = clusterIndex;
    });
  });
  return membership;
}

/**
 * クラスタの中のサブレーン 1 本（要件書「サブクラスタ」§2.3）。
 *
 * オフセットはクラスタのオフセットを**織り込んだ最終値**である。呼び出し側が 2 段を足し合わせる
 * 形にすると、片方だけを使った経路が「クラスタは分かれているのにサブは元の位置」という
 * 図として成立する壊れ方をする。
 */
export interface ClusterSubLanePlacement {
  /** `clusters[i].subclusters` の添字。残余サブレーン（どのサブクラスタにも入らない語）では undefined。 */
  subcluster?: number;
  members: readonly number[];
  offsetX: number;
  offsetY: number;
  labelX: number;
  labelY: number;
}

/** レーン 1 本。`cluster` を持たない 1 本が「未分類」レーン（要件書 §2.3）。 */
export interface ClusterLanePlacement {
  /** `spec.clusters` の添字。未分類レーンでは undefined。 */
  cluster?: number;
  /** このレーンに属する語の添字。 */
  members: readonly number[];
  offsetX: number;
  offsetY: number;
  /** レーン名を描く位置（世界座標。レーンが占める矩形の始端角）。 */
  labelX: number;
  labelY: number;
  /**
   * クラスタの中の細分。**細分していないクラスタでは空**。
   *
   * Why not 細分していないクラスタにも 1 本の暗黙のサブレーンを持たせるか: 「サブレーンが
   * 1 本ある」と「細分していない」が同じ形になり、観測点から区別できなくなる。
   */
  subLanes: ClusterSubLanePlacement[];
}

export interface ClusterLaneInput {
  /** 全体レイアウト座標（移動前）。 */
  positions: readonly (readonly [number, number])[];
  /** 語ごとのクラスタ番号（`clusterMembership` の出力）。 */
  membership: readonly (number | undefined)[];
  clusterCount: number;
  /** レーンを並べる軸。スライスのレイヤー軸と直交する（要件書 §2.1）。 */
  axis: LayerAxis;
  /** レーン間の余白（世界座標）。 */
  gap: number;
  /** 語の半径ぶんの膨らませ量。円が矩形からはみ出して隣のレーンへ食い込むのを防ぐ。 */
  padding: number;
  /**
   * クラスタごとのサブクラスタ（要件書「サブクラスタ」§2.3）。`subclusters[c]` はクラスタ c の
   * サブクラスタの並びで、各要素は語の添字の配列。省略時は細分なし。
   *
   * ラベルを受けないのは、この関数が決めるのが配置だけだからである。名前の解決（無題・未分類の
   * 文言）は表示側の関心で、ここへ持ち込むと i18n が幾何の計算に混ざる。
   */
  subclusters?: ReadonlyArray<ReadonlyArray<readonly number[]>>;
}

/** サブレーン間の余白は、クラスタ間の余白のこの割合にする（要件書 §2.3）。 */
export const CLUSTER_SUB_LANE_GAP_RATIO = 1 / 3;

/**
 * レーンをクラスタの実寸で詰める。
 *
 * Why not 全レーン等ピッチにするか: 全体の外接矩形から一定ピッチを取ると、語が 1 つしかない
 * クラスタも最大のクラスタと同じ幅を占め、図の大半が空白になる。時間スライスが等ピッチでよいのは
 * どのレイヤーも同じ和集合座標を使い占める矩形が原理的に等しいためで、クラスタには当てはまらない。
 *
 * Why not 表示中の語から区間を求めるか: 絞り込みでレーンの中身が減るたびに全レーンの位置が動き、
 * 語の位置が絞り込みの副作用で移動する。表示集合を受け取る口をそもそも持たせない。
 *
 * 語を 1 つも持たないレーンは作らない。空のレーンは「何も無いクラスタ」と見分けがつかない。
 */
export function computeClusterLanePlacements(input: ClusterLaneInput): ClusterLanePlacement[] {
  const { positions, membership, axis, gap, padding } = input;
  if (positions.length === 0) return [];

  const along = (index: number): number => (axis === 'horizontal' ? positions[index][0] : positions[index][1]);
  const across = (index: number): number => (axis === 'horizontal' ? positions[index][1] : positions[index][0]);

  const laneKeys: (number | undefined)[] = [
    ...Array.from({ length: input.clusterCount }, (_value, index) => index),
    undefined,
  ];
  const memberIndexes = new Map<number | undefined, number[]>(laneKeys.map((key) => [key, []]));
  positions.forEach((_position, index) => {
    const key = membership[index];
    memberIndexes.get(key === undefined ? undefined : key)?.push(index);
  });

  // レーン軸でない側の下端。レーン名を図の外側へ揃えて置くための基準。
  let acrossMin = Infinity;
  positions.forEach((_position, index) => {
    acrossMin = Math.min(acrossMin, across(index) - padding);
  });

  const subGap = gap * CLUSTER_SUB_LANE_GAP_RATIO;
  const extentOf = (group: readonly number[]): { min: number; max: number } => {
    const values = group.map(along);
    return { min: Math.min(...values) - padding, max: Math.max(...values) + padding };
  };
  const place = (start: number, axisOffset: number): Pick<ClusterSubLanePlacement, 'offsetX' | 'offsetY' | 'labelX' | 'labelY'> => ({
    offsetX: axis === 'horizontal' ? axisOffset : 0,
    offsetY: axis === 'vertical' ? axisOffset : 0,
    labelX: axis === 'horizontal' ? start : acrossMin,
    labelY: axis === 'horizontal' ? acrossMin : start,
  });

  const lanes: ClusterLanePlacement[] = [];
  let cursor: number | null = null;
  for (const key of laneKeys) {
    const members = memberIndexes.get(key) ?? [];
    if (members.length === 0) continue;
    const extent = extentOf(members);
    // 1 本目は元の位置に置く（レーン化しても図全体が飛ばない）。2 本目以降は直前の終端 + 余白。
    const start: number = cursor === null ? extent.min : cursor + gap;
    const offset: number = start - extent.min;

    // クラスタの中を細分する。細分がなければ、クラスタ 1 本ぶんをそのまま占める。
    const groups = subclusterGroups(key === undefined ? undefined : input.subclusters?.[key], members);
    const subLanes: ClusterSubLanePlacement[] = [];
    let laneEnd = extent.max + offset;
    if (groups.length > 0) {
      let subCursor = start;
      for (const group of groups) {
        const subExtent = extentOf(group.members);
        const subOffset = subCursor - subExtent.min;
        subLanes.push({
          ...(group.subcluster === undefined ? {} : { subcluster: group.subcluster }),
          members: group.members,
          ...place(subCursor, subOffset),
        });
        subCursor = subExtent.max + subOffset + subGap;
      }
      // 最後に足した余白は帯の外なので戻す。
      laneEnd = subCursor - subGap;
    }
    cursor = laneEnd;
    lanes.push({
      ...(key === undefined ? {} : { cluster: key }),
      members,
      ...place(start, offset),
      subLanes,
    });
  }
  return lanes;
}

/**
 * クラスタの中を、サブクラスタ + 残余へ分ける（要件書「サブクラスタ」§2.3）。
 *
 * 細分していないクラスタでは空を返す。残余（どのサブクラスタにも入らない語）は末尾に置き、
 * 名前を持たない。0 件なら作らない。
 *
 * サブクラスタが宣言する語のうち、そのクラスタに属さないものは無視する。所属を決めるのは
 * クラスタの `members` だけであり（検証がこの状態を拒否するが、描画側でも所属外の語を
 * レーンへ引き込まない）。
 */
function subclusterGroups(
  subclusters: ReadonlyArray<readonly number[]> | undefined,
  members: readonly number[],
): Array<{ subcluster?: number; members: readonly number[] }> {
  if (subclusters === undefined || subclusters.length === 0) return [];
  const owned = new Set(members);
  const claimed = new Set<number>();
  const groups: Array<{ subcluster?: number; members: readonly number[] }> = [];
  subclusters.forEach((subcluster, index) => {
    const picked = subcluster.filter((member) => owned.has(member) && !claimed.has(member));
    picked.forEach((member) => claimed.add(member));
    if (picked.length > 0) groups.push({ subcluster: index, members: picked });
  });
  if (groups.length === 0) return [];
  const residual = members.filter((member) => !claimed.has(member));
  if (residual.length > 0) groups.push({ members: residual });
  return groups;
}

/**
 * レーンのオフセットを座標へ適用する。
 *
 * どのレーンにも入らない語（レーンが 1 本も無いとき）は動かさない。
 */
export function applyClusterLanes(
  positions: readonly (readonly [number, number])[],
  lanes: readonly ClusterLanePlacement[],
): Array<[number, number]> {
  const moved = positions.map((position): [number, number] => [position[0], position[1]]);
  for (const lane of lanes) {
    // 細分しているクラスタでは、語ごとの移動量はサブレーンが持つ（クラスタのオフセットは
    // 帯の始端を表すだけで、語の位置ではない）。
    const units = lane.subLanes.length > 0 ? lane.subLanes : [lane];
    for (const unit of units) {
      for (const index of unit.members) {
        const position = moved[index];
        if (position === undefined) continue;
        position[0] += unit.offsetX;
        position[1] += unit.offsetY;
      }
    }
  }
  return moved;
}
