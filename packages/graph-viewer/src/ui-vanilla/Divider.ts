/**
 * graph-viewer vanilla Divider ファクトリ。
 *
 * React 実装 `ui/Divider.tsx` の DOM 版。gv-divider クラスは `ui/injectStyles.ts` 定義済み。
 * 横（既定）／縦の両対応。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { applyStyle } from './dom';

export interface CreateDividerProps {
  readonly orientation?: 'horizontal' | 'vertical';
  /** MUI 互換: flex コンテナ内で交差軸方向へ伸ばす（vertical 時に有効）。 */
  readonly flexItem?: boolean;
  readonly style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Divider の vanilla 置換（区切り線）。
 *
 * @returns `HTMLHRElement`
 */
export function createDivider(props: Readonly<CreateDividerProps> = {}): HTMLHRElement {
  injectGraphUiStyles();

  const orientation = props.orientation ?? 'horizontal';
  const className =
    orientation === 'vertical' ? 'gv-divider gv-divider--vertical' : 'gv-divider';

  const el = document.createElement('hr');
  el.className = className;
  if (props.style) applyStyle(el, props.style);

  return el;
}
