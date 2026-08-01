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

import { createDivider } from '@anytime-markdown/ui-core/Divider';
import { createListItemIcon } from '@anytime-markdown/ui-core/ListItemIcon';
import { createListItemText } from '@anytime-markdown/ui-core/ListItemText';

/** gv createListItemIcon 互換（要素返し）。色・幅は --am-color-action-active / --am-menu-icon-minw。 */
export const listItemIcon = (
  o: Parameters<typeof createListItemIcon>[0],
): HTMLSpanElement => createListItemIcon(o).el;

/** gv createListItemText 互換（要素返し）。flex 伸長・省略表示は ui-core 側の既定。 */
export const listItemText = (
  o: Parameters<typeof createListItemText>[0],
): HTMLSpanElement => createListItemText(o).el;

/**
 * gv createDivider 互換（要素返し）。gv 既定意匠の margin 4px 0（.gv-divider /
 * .gv-divider--vertical 共通）を維持しつつ、呼び元の style 指定を優先する。
 * 色は --am-color-divider（= --gv-color-divider と同値）。
 */
export const divider = (
  o: Parameters<typeof createDivider>[0] = {},
): HTMLHRElement => createDivider({ ...o, style: { margin: '4px 0', ...o.style } }).el;
