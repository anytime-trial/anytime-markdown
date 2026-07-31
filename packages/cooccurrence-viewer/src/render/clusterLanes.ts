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
}

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

  const lanes: ClusterLanePlacement[] = [];
  let cursor: number | null = null;
  for (const key of laneKeys) {
    const members = memberIndexes.get(key) ?? [];
    if (members.length === 0) continue;
    const values = members.map(along);
    const min = Math.min(...values) - padding;
    const max = Math.max(...values) + padding;
    // 1 本目は元の位置に置く（レーン化しても図全体が飛ばない）。2 本目以降は直前の終端 + 余白。
    const start: number = cursor === null ? min : cursor + gap;
    const offset: number = start - min;
    cursor = max + offset;
    lanes.push({
      ...(key === undefined ? {} : { cluster: key }),
      members,
      offsetX: axis === 'horizontal' ? offset : 0,
      offsetY: axis === 'vertical' ? offset : 0,
      labelX: axis === 'horizontal' ? start : acrossMin,
      labelY: axis === 'horizontal' ? acrossMin : start,
    });
  }
  return lanes;
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
    for (const index of lane.members) {
      const position = moved[index];
      if (position === undefined) continue;
      position[0] += lane.offsetX;
      position[1] += lane.offsetY;
    }
  }
  return moved;
}
