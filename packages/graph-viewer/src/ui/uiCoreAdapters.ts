/**
 * ui-core ファクトリ（ハンドル返し）を gv ui-vanilla の要素返し呼び出し規約へ合わせる
 * 移行期アダプタ。
 *
 * graph-viewer の呼び出し側は要素（Node）を children として直接合成するため、
 * `{ el, ... }` ハンドルから `.el` を取り出す変換と、gv 既定意匠のうち ui-core の
 * 既定と異なる値（Divider の margin 等）の付与をここへ一元化する。対象の部品は
 * static content / 使い捨てで update・destroy を使わない（listener は要素の GC と
 * 共に回収される）。
 *
 * ui-vanilla 撤去（フェーズ4）完了後、意匠を ui-core 標準へ寄せるかの判断とセットで
 * 削除候補（graphMenu.ts と同じ位置づけ）。
 */

import { createListItemIcon } from '@anytime-markdown/ui-core/ListItemIcon';

/** gv createListItemIcon 互換（要素返し）。色・幅は --am-color-action-active / --am-menu-icon-minw。 */
export const listItemIcon = (
  o: Parameters<typeof createListItemIcon>[0],
): HTMLSpanElement => createListItemIcon(o).el;
