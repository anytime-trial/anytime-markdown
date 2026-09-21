/**
 * 図の見え方（平行移動・倍率）と、指の動きを図の座標へ写す変換。
 *
 * 配置の編集はこの変換だけで決まるので、部品の中に埋めずここへ置いてテストから触れるようにする
 * （ドラッグそのものは実機でしか動かせない。変換を関数へ出せば、倍率と平行移動の掛け違いは
 * 机上で捕まる）。移植元は anytime-travel の `src/map/genealogy-layout.ts` の変換部分。
 */

import type { GridCell } from './grid';
import { resizedSpacing } from './spacing';
import type { DiagramSpacing } from './types';

export interface ChartView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MIN_SCALE = 0.025;
export const MAX_SCALE = 3;

/** 画面の座標を図の座標へ写す。 */
export function chartPoint(
  view: ChartView,
  rect: { readonly left: number; readonly top: number },
  clientX: number,
  clientY: number,
): { readonly x: number; readonly y: number } {
  return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
}

/**
 * 掴んだ点と箱のずれを保った移動先。負の座標は枠の外へ出るので 0 で止める。
 *
 * 整数へ丸めるのは、保存する差分に意味の無い小数が積もらないようにするため。
 */
export function placementFromDrag(
  view: ChartView,
  rect: { readonly left: number; readonly top: number },
  clientX: number,
  clientY: number,
  offset: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const point = chartPoint(view, rect, clientX, clientY);
  return { x: Math.max(0, Math.round(point.x - offset.x)), y: Math.max(0, Math.round(point.y - offset.y)) };
}

/** ある点を中心に拡大縮小する。倍率は範囲の端で止める。 */
export function zoomAt(view: ChartView, factor: number, x: number, y: number): ChartView {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio };
}

/** 枠の中へ図を収める見え方。 */
export function fitChart(width: number, height: number, chartWidth: number, chartHeight: number): ChartView {
  const scale = Math.max(MIN_SCALE, Math.min(1, (width - 32) / chartWidth, (height - 32) / chartHeight));
  return { scale, x: (width - chartWidth * scale) / 2, y: (height - chartHeight * scale) / 2 };
}

/**
 * 画面から変えられる刻みの項目。`false` は**意図して口を持たない**という宣言。
 *
 * `Record<keyof DiagramSpacing, boolean>` にするので、刻みに項目を足すと型検査がここへの追記を
 * 要求し、`false` と書くには「口を持たない」と自分で言い切ることになる。
 *
 * すき間が `false` なのは、箱の縁を掴んで変える操作が箱の大きさだけを対象にするため
 * （保存済みのすき間は保たれ、戻す口だけが残る）。
 */
export const SPACING_EDITABLE: Record<keyof DiagramSpacing, boolean> = {
  columnGap: false,
  nodeWidth: true,
  rowGap: false,
  nodeHeight: true,
};

/** 画面から変えられる刻みの項目の一覧。取っ手の数はここから導く（件数を書き写さない）。 */
export const editableSpacingKeys = (): readonly (keyof DiagramSpacing)[] =>
  (Object.keys(SPACING_EDITABLE) as (keyof DiagramSpacing)[]).filter((key) => SPACING_EDITABLE[key]);

/**
 * 指の動きから引いた先の箱の大きさ。**取っ手の居る升目を勘定に入れる。**
 *
 * 箱の右辺の座標は `余白 + 列 × すき間 + (列 + 1) × 幅` で、幅の 1 次関数だが**傾きが列 + 1**。
 * 指の動きをそのまま幅の差にすると、左上が列 0 に無い図では辺が指の 2 倍・3 倍動き、押さえた
 * はずの縁が手の下から抜ける。列 0・行 0 の図では 1 対 1 になるので、**手で確かめると必ず
 * 正しく見える**。
 *
 * 倍率も**掴んだ瞬間のもの**を受ける。移動のたびに今の倍率で割ると、ドラッグ中にホイールを回した
 * 瞬間、それまでに引いた量まで新しい倍率で換算し直されて箱が飛ぶ。
 */
export function resizeFromDrag(options: {
  readonly start: DiagramSpacing;
  /** 掴んだ瞬間からの指の動き（画面 px）。 */
  readonly pointer: { readonly x: number; readonly y: number };
  /** 掴んだ瞬間の倍率。 */
  readonly scale: number;
  /** 取っ手の居る升目。 */
  readonly anchor: GridCell;
  readonly axes: { readonly width: boolean; readonly height: boolean };
}): DiagramSpacing {
  const { start, pointer, scale, anchor, axes } = options;
  return resizedSpacing(start, {
    x: pointer.x / (scale * (anchor.column + 1)),
    y: pointer.y / (scale * (anchor.row + 1)),
  }, axes);
}
