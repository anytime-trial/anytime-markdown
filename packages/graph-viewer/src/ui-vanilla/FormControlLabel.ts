/**
 * graph-viewer vanilla FormControlLabel ファクトリ。
 *
 * React 実装 `ui/FormControlLabel.tsx` の DOM 版。gv-form-control-label クラスは
 * `ui/injectStyles.ts` 定義済み。control と label を横並びにする `<label>` 要素。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, applyStyle, type VanillaContent } from './dom';

export interface CreateFormControlLabelProps {
  /** 制御要素（Switch / Checkbox 等）の DOM ノード。 */
  readonly control: Node;
  readonly label: VanillaContent;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
}

/**
 * MUI FormControlLabel の vanilla 置換（単体 control 用）。
 * control と label を横並びにする。
 *
 * @returns `HTMLLabelElement`
 */
export function createFormControlLabel(
  props: Readonly<CreateFormControlLabelProps>,
): HTMLLabelElement {
  injectGraphUiStyles();

  const classes = ['gv-form-control-label', props.className ?? ''].filter(Boolean).join(' ');

  const el = document.createElement('label');
  el.className = classes;
  if (props.style) applyStyle(el, props.style);

  el.appendChild(props.control);
  appendContent(el, props.label);

  return el;
}
