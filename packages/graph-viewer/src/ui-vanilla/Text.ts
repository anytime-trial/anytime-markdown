/**
 * graph-viewer vanilla Text ファクトリ。
 *
 * React 実装 `ui/Text.tsx` の DOM 版。gv-text 系クラスは `ui/injectStyles.ts` 定義済み。
 * body / caption / subtitle2 × 任意の color をサポート。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, applyStyle, type VanillaContent } from './dom';

export type TextVariant = 'body' | 'caption' | 'subtitle2';
export type TextColor = 'text.secondary' | 'error' | 'inherit';

const VARIANT_CLASS: Readonly<Record<TextVariant, string>> = {
  body: 'gv-text',
  caption: 'gv-text gv-text-caption',
  subtitle2: 'gv-text gv-text-subtitle2',
};

const COLOR_CLASS: Readonly<Record<string, string>> = {
  'text.secondary': 'gv-text-secondary',
  error: 'gv-text-error',
};

export interface CreateTextProps {
  readonly variant?: TextVariant;
  /** MUI 互換: "text.secondary" / "error" を受ける。それ以外は inherit。 */
  readonly color?: TextColor;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
  readonly children?: VanillaContent;
  readonly title?: string;
}

/**
 * MUI Typography の vanilla 置換（body / caption / subtitle2）。
 *
 * @returns `HTMLSpanElement`
 */
export function createText(props: Readonly<CreateTextProps> = {}): HTMLSpanElement {
  injectGraphUiStyles();

  const variant: TextVariant = props.variant ?? 'body';
  const cls = [
    VARIANT_CLASS[variant],
    props.color ? (COLOR_CLASS[props.color] ?? '') : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const el = document.createElement('span');
  el.className = cls;
  if (props.style) applyStyle(el, props.style);
  if (props.title !== undefined) el.title = props.title;
  if (props.children !== undefined) appendContent(el, props.children);

  return el;
}
