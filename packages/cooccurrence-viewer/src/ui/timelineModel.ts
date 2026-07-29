import type { LayerAxis, TimelineViewState } from '../types';
import { DEFAULT_LAYER_GAP } from '../render/layerLayout';

/**
 * 時間軸の表示状態（設計書 §3.6.2・§3.6.4）。
 *
 * ここが持つのはすべて表示状態であり、`.cooc.json` へは書かない。タブの選択状態と同じ扱いで、
 * ファイルの内容ではない。
 */

export const LAYER_AXES: readonly LayerAxis[] = ['horizontal', 'vertical'];

/**
 * 時間軸を持つファイルの既定はレイヤー表示（設計書 §3.6.4）。
 *
 * 既定を単一表示にすると、時間軸を持つファイルを開いても従来と同じ図が出るだけで、時間軸が
 * 付いていること自体が画面から分からない。
 */
export function defaultTimelineViewState(): TimelineViewState {
  return { layered: true, axis: 'horizontal', gap: DEFAULT_LAYER_GAP, showTimeLinks: true };
}

/**
 * 描くレイヤーに対応するスライスの添字を、時間順に並べて返す。
 *
 * `selected` が `undefined` のときは全スライス。空配列は「1 枚も表示しない」であり、
 * `undefined` と区別する（利用者が全てのチェックを外した状態を「全表示」に戻さない）。
 */
export function visibleSliceIndexes(sliceCount: number, selected: readonly number[] | undefined): number[] {
  if (selected === undefined) return Array.from({ length: sliceCount }, (_unused, index) => index);
  const unique = new Set(selected.filter((index) => Number.isInteger(index) && index >= 0 && index < sliceCount));
  return [...unique].sort((a, b) => a - b);
}

export function isLayerAxis(value: unknown): value is LayerAxis {
  return value === 'horizontal' || value === 'vertical';
}
