import type { CooccurrenceSlice } from '@anytime-markdown/graph-core';
import type { LayerAxis, RenderLayer } from '../types';
import type { Bounds } from '../viewport/viewport';

/**
 * レイヤーの配置（設計書 §3.6.1・§3.6.2）。
 *
 * レイアウトは全期間の和集合に対して 1 回だけ計算し、各レイヤーはその座標を平行移動して使う。
 * ここが決めるのは平行移動の量だけであり、語の相対位置はどのレイヤーでも同じである。この選択に
 * より、レイヤー間の点線が完全に平行になり、レイヤー間の差分（消えた線・現れた線）が形の差と
 * して直接読める。
 *
 * レイヤーをワールド座標のオフセットで表すため、ビューポート・パン・ズーム・ミニマップ・
 * ヒットテストはレイヤーという概念を知らないまま動く。
 */

/** レイヤー 1 枚が占める幅（または高さ）に足す既定の余白（世界座標）。 */
export const DEFAULT_LAYER_GAP = 160;

/**
 * 和集合の座標の外接矩形。
 *
 * Why not 表示対象だけから求めるか: 絞り込みでレイヤーの中身が減るたびに全レイヤーの間隔が
 * 動き、語の位置が絞り込みの副作用で移動する。間隔は絞り込みに依存しない量にする。
 *
 * Why not 語ごとの半径を受けるか: 半径は円の大きさの尺度に依存し、その尺度はレイヤー表示の
 * 有無で変わる（`buildRenderGraph` の `scaleRanges`）。間隔が尺度に依存すると、レイヤー表示へ
 * 切り替えた瞬間に間隔まで動く。半径の上限（`RADIUS_MAX`）で一律に膨らませる。
 */
export function unionBounds(
  positions: readonly (readonly [number, number])[],
  padding: number,
): Bounds | null {
  if (positions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const position of positions) {
    minX = Math.min(minX, position[0] - padding);
    minY = Math.min(minY, position[1] - padding);
    maxX = Math.max(maxX, position[0] + padding);
    maxY = Math.max(maxY, position[1] + padding);
  }
  return { minX, minY, maxX, maxY };
}

/** 隣り合うレイヤーの原点どうしの距離。 */
export function layerPitch(bounds: Bounds | null, axis: LayerAxis, gap: number): number {
  if (bounds === null) return gap;
  const span = axis === 'horizontal' ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY;
  return span + gap;
}

export interface LayerPlacementInput {
  slices: readonly CooccurrenceSlice[];
  /** 表示するスライスの添字（絞り込み後。設計書 §3.6.5）。 */
  visibleSliceIndexes: readonly number[];
  bounds: Bounds | null;
  axis: LayerAxis;
  gap: number;
}

/**
 * 表示するスライスをレイヤーへ割り付ける。
 *
 * 落としたスライスの分の空きは詰める。空けたままにすると、表示するスライスを絞った図に
 * 「何も描かれていないレイヤー」と見分けのつかない空白ができる。
 */
export function computeLayerPlacements(input: LayerPlacementInput): RenderLayer[] {
  const pitch = layerPitch(input.bounds, input.axis, input.gap);
  const placements: RenderLayer[] = [];
  input.visibleSliceIndexes.forEach((slice, layer) => {
    const definition = input.slices[slice];
    if (definition === undefined) return;
    const offsetX = input.axis === 'horizontal' ? pitch * layer : 0;
    const offsetY = input.axis === 'vertical' ? pitch * layer : 0;
    placements.push({
      layer,
      slice,
      label: definition.label,
      ...(definition.at === undefined ? {} : { at: definition.at }),
      offsetX,
      offsetY,
      labelX: (input.bounds?.minX ?? 0) + offsetX,
      labelY: (input.bounds?.minY ?? 0) + offsetY,
    });
  });
  return placements;
}
