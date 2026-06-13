/**
 * graph-viewer vanilla ListItemText ファクトリ。
 *
 * React 実装 `ui/ListItemText.tsx` の DOM 版。gv-list-item-text クラスは
 * `ui/injectStyles.ts` 定義済み（メニュー項目のラベル）。
 *
 * ListItemText は injectStyles を呼ばない（元 .tsx と同様）ため、
 * 呼び出し元の MenuItem 等が先に injectGraphUiStyles() を呼ぶことを前提とする。
 */

import { appendContent, type VanillaContent } from './dom';

export interface CreateListItemTextProps {
  readonly children?: VanillaContent;
}

/**
 * MUI ListItemText の vanilla 置換（メニュー項目のラベル）。
 *
 * @returns `HTMLSpanElement`
 */
export function createListItemText(props: Readonly<CreateListItemTextProps> = {}): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'gv-list-item-text';
  if (props.children !== undefined) appendContent(el, props.children);
  return el;
}
