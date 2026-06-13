/**
 * graph-viewer vanilla ListItemIcon ファクトリ。
 *
 * React 実装 `ui/ListItemIcon.tsx` の DOM 版。gv-list-item-icon クラスは
 * `ui/injectStyles.ts` 定義済み（メニュー項目の先頭アイコン枠）。
 *
 * ListItemIcon は injectStyles を呼ばない（元 .tsx と同様）ため、
 * 呼び出し元の MenuItem 等が先に injectGraphUiStyles() を呼ぶことを前提とする。
 */

import { appendContent, type VanillaContent } from './dom';

export interface CreateListItemIconProps {
  readonly children?: VanillaContent;
}

/**
 * MUI ListItemIcon の vanilla 置換（メニュー項目の先頭アイコン枠）。
 *
 * @returns `HTMLSpanElement`
 */
export function createListItemIcon(props: Readonly<CreateListItemIconProps> = {}): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'gv-list-item-icon';
  if (props.children !== undefined) appendContent(el, props.children);
  return el;
}
