import type { ClusterLaneViewState, LayerAxis } from '../types';
import { DEFAULT_LAYER_GAP } from '../render/layerLayout';

/**
 * クラスタレーン表示の状態（要件書「クラスタレーン表示」§2.1）。
 *
 * ここが持つのはすべて表示状態であり、`.cooc.json` へは書かない（時間軸の表示状態と同じ扱い）。
 */

/** レーン間の余白の入力範囲（世界座標）。0 にすると隣のレーンの円が接して区切りが読めない。 */
export const CLUSTER_LANE_GAP_MIN = 40;
export const CLUSTER_LANE_GAP_MAX = 800;
export const CLUSTER_LANE_GAP_STEP = 20;

/**
 * 既定はレーン化しない。
 *
 * 時間軸と違い、クラスタは全てのファイルが持ちうる。既定でレーン化すると、クラスタを持つ図が
 * すべて従来と別の形で開くことになり、この表示を求めていない利用者にも影響が及ぶ。
 */
export function defaultClusterLaneViewState(): ClusterLaneViewState {
  return { enabled: false, gap: DEFAULT_LAYER_GAP };
}

/**
 * レーンを並べる軸。**スライスのレイヤー軸と常に直交させる**（要件書 §2.1）。
 *
 * Why not 利用者に選ばせるか: 同じ軸を両方が使うと、スライスのレイヤーとクラスタのレーンが
 * 同一方向へ重なり、どちらの区切りなのか図から判別できない状態を作れてしまう。直交は制約では
 * なく、この表示が成立する条件である。
 *
 * レイヤー表示でないとき（単一表示・スライスなし）は縦に積む。
 */
export function clusterLaneAxis(layerAxis: LayerAxis | null): LayerAxis {
  if (layerAxis === null) return 'vertical';
  return layerAxis === 'horizontal' ? 'vertical' : 'horizontal';
}
