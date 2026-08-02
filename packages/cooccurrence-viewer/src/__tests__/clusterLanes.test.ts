import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import {
  applyClusterLanes,
  clusterMembership,
  computeClusterLanePlacements,
  type ClusterLanePlacement,
} from '../render/clusterLanes';
import { layerPitch, unionBounds } from '../render/layerLayout';

function fileWith(clusters: Array<{ label: string; members: number[] }> | undefined, nodeCount: number): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: Array.from({ length: nodeCount }, (_value, index) => ({ label: `w${index}`, frequency: 1 })),
      links: [],
      ...(clusters === undefined ? {} : { clusters }),
    },
  };
}

/** レーンが占める区間（レーン軸方向）。重なりの検査に使う。 */
function laneSpan(
  lane: ClusterLanePlacement,
  positions: readonly (readonly [number, number])[],
  axis: 'horizontal' | 'vertical',
  padding: number,
): { min: number; max: number } {
  const offset = axis === 'horizontal' ? lane.offsetX : lane.offsetY;
  const values = lane.members.map((index) => (axis === 'horizontal' ? positions[index][0] : positions[index][1]));
  return { min: Math.min(...values) - padding + offset, max: Math.max(...values) + padding + offset };
}

describe('clusterMembership', () => {
  it('語ごとのクラスタ番号を返し、どのクラスタにも属さない語は undefined になる', () => {
    const file = fileWith([{ label: 'A', members: [0, 1] }, { label: 'B', members: [3] }], 5);
    expect(clusterMembership(file)).toEqual([0, 0, undefined, 1, undefined]);
  });

  it('2 つのクラスタが同じ語を持つときは先に現れたクラスタが勝つ', () => {
    const file = fileWith([{ label: 'A', members: [0] }, { label: 'B', members: [0] }], 2);
    expect(clusterMembership(file)).toEqual([0, undefined]);
  });

  it('クラスタを持たないファイルでは全て undefined', () => {
    expect(clusterMembership(fileWith(undefined, 3))).toEqual([undefined, undefined, undefined]);
  });
});

describe('computeClusterLanePlacements', () => {
  // クラスタ 0 = 語 0,1（y は 0 と 20）、クラスタ 1 = 語 2（y は 500）、未分類 = 語 3（y は -300）。
  // 実寸で詰めるため、y の元の散らばりに関わらずレーンは順に並ぶ。
  const positions: Array<[number, number]> = [
    [0, 0],
    [10, 20],
    [-40, 500],
    [30, -300],
  ];
  const membership = [0, 0, 1, undefined];
  const padding = 10;
  const gap = 100;

  it('縦軸ではレーンが順に詰められ、重ならない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'vertical',
      gap,
      padding,
    });
    expect(lanes.map((lane) => lane.cluster)).toEqual([0, 1, undefined]);

    const spans = lanes.map((lane) => laneSpan(lane, positions, 'vertical', padding));
    // レーン 0 は 40 幅（-10..30）、レーン 1・2 は 20 幅。隣り合う区間の距離はちょうど gap。
    expect(spans[1].min - spans[0].max).toBeCloseTo(gap);
    expect(spans[2].min - spans[1].max).toBeCloseTo(gap);
  });

  it('縦軸ではレーン軸でない x を動かさない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'vertical',
      gap,
      padding,
    });
    expect(lanes.every((lane) => lane.offsetX === 0)).toBe(true);
  });

  it('横軸ではレーン軸でない y を動かさない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'horizontal',
      gap,
      padding,
    });
    expect(lanes.every((lane) => lane.offsetY === 0)).toBe(true);
    const spans = lanes.map((lane) => laneSpan(lane, positions, 'horizontal', padding));
    expect(spans[1].min - spans[0].max).toBeCloseTo(gap);
    expect(spans[2].min - spans[1].max).toBeCloseTo(gap);
  });

  it('未分類の語が無ければ未分類レーンを作らない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership: [0, 0, 1, 1],
      clusterCount: 2,
      axis: 'vertical',
      gap,
      padding,
    });
    expect(lanes.map((lane) => lane.cluster)).toEqual([0, 1]);
  });

  it('語を 1 つも持たないクラスタはレーンを作らない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership: [0, 0, 2, undefined],
      clusterCount: 3,
      axis: 'vertical',
      gap,
      padding,
    });
    expect(lanes.map((lane) => lane.cluster)).toEqual([0, 2, undefined]);
  });

  it('語が無ければレーンは 0 本', () => {
    expect(
      computeClusterLanePlacements({ positions: [], membership: [], clusterCount: 0, axis: 'vertical', gap, padding }),
    ).toEqual([]);
  });

  it('レーン名の位置は、縦軸ではレーンの始端 y と全体の左端 x を指す', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'vertical',
      gap,
      padding,
    });
    const globalMinX = Math.min(...positions.map((position) => position[0])) - padding;
    expect(lanes.every((lane) => lane.labelX === globalMinX)).toBe(true);
    const spans = lanes.map((lane) => laneSpan(lane, positions, 'vertical', padding));
    lanes.forEach((lane, index) => expect(lane.labelY).toBeCloseTo(spans[index].min));
  });

  /**
   * レーンの区間は「そのクラスタに属する全ての語」から求める。表示中の語から求めると、
   * 絞り込みのたびにレーン幅が動き、語の位置が絞り込みの副作用で移動する（要件書 §2.2）。
   * 入力に表示集合を渡す口が無いこと自体が、その保証になっている。
   */
  it('レーンの区間は全語から決まり、同じ座標・同じ所属なら常に同じ結果になる', () => {
    const input = { positions, membership, clusterCount: 2, axis: 'vertical' as const, gap, padding };
    expect(computeClusterLanePlacements(input)).toEqual(computeClusterLanePlacements(input));
  });
});

/**
 * レーン化はスライス軸方向の座標を動かさない（要件書 §2.2・§2.5）。動かすと、同じ語がレイヤーごとに
 * 別の位置へ現れ、レイヤー間の点線が図を斜めに横切る。ピッチが動けばレイヤーの間隔も狂う。
 */
describe('レーン化とレイヤーの共存', () => {
  const positions: Array<[number, number]> = [
    [0, 0],
    [40, 30],
    [10, 400],
    [-60, -250],
  ];
  const membership = [0, 0, 1, undefined];
  const padding = 10;

  it('クラスタ軸が縦なら、横並びレイヤーのピッチは変わらない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'vertical',
      gap: 100,
      padding,
    });
    const laned = applyClusterLanes(positions, lanes);
    const before = layerPitch(unionBounds(positions, padding), 'horizontal', 160);
    const after = layerPitch(unionBounds(laned, padding), 'horizontal', 160);
    expect(after).toBeCloseTo(before);
  });

  it('クラスタ軸が横なら、縦並びレイヤーのピッチは変わらない', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'horizontal',
      gap: 100,
      padding,
    });
    const laned = applyClusterLanes(positions, lanes);
    const before = layerPitch(unionBounds(positions, padding), 'vertical', 160);
    const after = layerPitch(unionBounds(laned, padding), 'vertical', 160);
    expect(after).toBeCloseTo(before);
  });

  it('クラスタ軸が縦なら、語の x はレーン化前後で一致する', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'vertical',
      gap: 100,
      padding,
    });
    const laned = applyClusterLanes(positions, lanes);
    expect(laned.map((position) => position[0])).toEqual(positions.map((position) => position[0]));
  });
});

describe('applyClusterLanes', () => {
  const positions: Array<[number, number]> = [
    [0, 0],
    [10, 20],
    [-40, 500],
    [30, -300],
  ];

  it('語をそれぞれのレーンのオフセットぶんだけ動かす', () => {
    const lanes = computeClusterLanePlacements({
      positions,
      membership: [0, 0, 1, undefined],
      clusterCount: 2,
      axis: 'vertical',
      gap: 100,
      padding: 10,
    });
    const moved = applyClusterLanes(positions, lanes);
    expect(moved).toHaveLength(positions.length);
    lanes.forEach((lane) => {
      lane.members.forEach((index) => {
        expect(moved[index][0]).toBeCloseTo(positions[index][0] + lane.offsetX);
        expect(moved[index][1]).toBeCloseTo(positions[index][1] + lane.offsetY);
      });
    });
  });

  it('レーンが 1 本も無ければ座標をそのまま返す', () => {
    expect(applyClusterLanes(positions, [])).toEqual(positions);
  });
});

/**
 * サブクラスタ（要件書「サブクラスタ」§2.3）。
 *
 * サブレーンはクラスタレーンと同じ軸方向の平行移動で、クラスタのオフセットに積み上がる。
 * 余白はクラスタ間より狭くする — 同じ余白だと、どこがクラスタの切れ目でどこがサブクラスタの
 * 切れ目か図から読めない。
 */
describe('サブレーン', () => {
  // クラスタ 0 = 語 0,1,2（y = 0, 20, 60）、クラスタ 1 = 語 3（y = 500）。
  const positions: Array<[number, number]> = [
    [0, 0],
    [10, 20],
    [-5, 60],
    [30, 500],
  ];
  const membership = [0, 0, 0, 1];
  const padding = 10;
  const gap = 120;

  function lanesWith(subclusters: number[][][]): ReturnType<typeof computeClusterLanePlacements> {
    return computeClusterLanePlacements({
      positions,
      membership,
      clusterCount: 2,
      axis: 'vertical',
      gap,
      padding,
      subclusters,
    });
  }

  it('サブクラスタが無ければサブレーンを作らない（従来どおり 1 本のレーン）', () => {
    const lanes = lanesWith([[], []]);
    expect(lanes.every((lane) => lane.subLanes.length === 0)).toBe(true);
  });

  it('サブクラスタごとにサブレーンを作り、残りを名前なしの残余サブレーンへ集める', () => {
    const lanes = lanesWith([[[0], [1]], []]);
    // 語 2 はどのサブクラスタにも入らない → 残余。
    expect(lanes[0].subLanes.map((sub) => sub.subcluster)).toEqual([0, 1, undefined]);
    expect(lanes[0].subLanes[2].members).toEqual([2]);
  });

  it('全てがサブクラスタに入れば残余サブレーンを作らない', () => {
    const lanes = lanesWith([[[0], [1, 2]], []]);
    expect(lanes[0].subLanes.map((sub) => sub.subcluster)).toEqual([0, 1]);
  });

  it('サブレーン間の余白はクラスタ間より狭い', () => {
    const lanes = lanesWith([[[0], [1]], []]);
    const span = (members: readonly number[], offset: number): { min: number; max: number } => {
      const values = members.map((index) => positions[index][1]);
      return { min: Math.min(...values) - padding + offset, max: Math.max(...values) + padding + offset };
    };
    const subs = lanes[0].subLanes.map((sub) => span(sub.members, sub.offsetY));
    const subGap = subs[1].min - subs[0].max;
    expect(subGap).toBeGreaterThan(0);
    expect(subGap).toBeLessThan(gap);
    // クラスタ 0 の終端とクラスタ 1 の始端の距離はクラスタ間の余白のまま。
    const cluster1 = span(lanes[1].members, lanes[1].offsetY);
    expect(cluster1.min - subs[subs.length - 1].max).toBeCloseTo(gap);
  });

  it('サブレーンに割ってもクラスタどうしは重ならない', () => {
    const lanes = lanesWith([[[0], [1], [2]], []]);
    const all = lanes.flatMap((lane) =>
      (lane.subLanes.length === 0 ? [{ members: lane.members, offsetY: lane.offsetY }] : lane.subLanes).map((unit) => {
        const values = unit.members.map((index) => positions[index][1]);
        return { min: Math.min(...values) - padding + unit.offsetY, max: Math.max(...values) + padding + unit.offsetY };
      }),
    );
    for (let i = 0; i + 1 < all.length; i++) expect(all[i + 1].min).toBeGreaterThan(all[i].max);
  });

  it('applyClusterLanes はサブレーンのオフセットで語を動かす', () => {
    const lanes = lanesWith([[[0], [1]], []]);
    const moved = applyClusterLanes(positions, lanes);
    lanes[0].subLanes.forEach((sub) => {
      sub.members.forEach((index) => {
        expect(moved[index][1]).toBeCloseTo(positions[index][1] + sub.offsetY);
        expect(moved[index][0]).toBeCloseTo(positions[index][0]);
      });
    });
  });

  it('サブレーン名の位置はレーン名と同じ側の軸に並ぶ', () => {
    const lanes = lanesWith([[[0], [1]], []]);
    expect(lanes[0].subLanes.every((sub) => sub.labelX === lanes[0].labelX)).toBe(true);
    // 先頭のサブレーンはクラスタの始端と同じ位置から始まる。
    expect(lanes[0].subLanes[0].labelY).toBeCloseTo(lanes[0].labelY);
  });
});
