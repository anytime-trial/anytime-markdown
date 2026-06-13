/**
 * graph-viewer vanilla IconButton ファクトリ。
 *
 * React 実装 `ui/IconButton.tsx` の DOM 版。gv-icon-btn クラスは `ui/injectStyles.ts` 定義済み。
 * 円形ホバー背景・disabled 半透明。color は currentColor 継承。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, type VanillaContent } from './dom';

export interface CreateIconButtonProps {
  readonly size?: 'small' | 'medium';
  readonly children?: VanillaContent;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly title?: string;
  /** a11y ラベル。 */
  readonly ariaLabel?: string;
  readonly onClick?: (e: MouseEvent) => void;
}

/**
 * MUI IconButton の vanilla 置換。
 *
 * @returns `HTMLButtonElement`
 */
export function createIconButton(props: Readonly<CreateIconButtonProps> = {}): HTMLButtonElement {
  injectGraphUiStyles();

  const size = props.size ?? 'medium';

  const classes = [
    'gv-icon-btn',
    size === 'small' ? 'gv-icon-btn--small' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const el = document.createElement('button');
  el.type = props.type ?? 'button';
  el.className = classes;

  if (props.disabled) el.disabled = true;
  if (props.title !== undefined) el.title = props.title;
  if (props.ariaLabel !== undefined) el.setAttribute('aria-label', props.ariaLabel);

  if (props.children !== undefined) appendContent(el, props.children);

  if (props.onClick) el.addEventListener('click', props.onClick as EventListener);

  return el;
}
