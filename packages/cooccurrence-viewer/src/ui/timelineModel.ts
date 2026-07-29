import type { CooccurrenceSlice } from '@anytime-markdown/graph-core';
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
 * 選択はラベルで受ける。添字で受けると、スライスを 1 枚消したり並べ替えたりするたびに選択が
 * 別のスライスを指す。存在しないラベルは黙って落とす（消えたスライスの選択が残っていても、
 * 描けるものだけを描く）。
 *
 * `selected` が `undefined` のときは全スライス。空配列は「1 枚も表示しない」であり、
 * `undefined` と区別する（利用者が全てのチェックを外した状態を「全表示」に戻さない）。
 */
export function visibleSliceIndexes(
  slices: readonly CooccurrenceSlice[],
  selected: readonly string[] | undefined,
): number[] {
  if (selected === undefined) return slices.map((_slice, index) => index);
  const wanted = new Set(selected);
  return slices.flatMap((slice, index) => (wanted.has(slice.label) ? [index] : []));
}

export function isLayerAxis(value: unknown): value is LayerAxis {
  return value === 'horizontal' || value === 'vertical';
}
