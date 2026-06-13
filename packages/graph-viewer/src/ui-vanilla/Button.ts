/**
 * graph-viewer vanilla Button ファクトリ。
 *
 * React 実装 `ui/Button.tsx` の DOM 版。gv-* クラスは `ui/injectStyles.ts` 定義済み。
 * text / outlined / contained × small / medium をサポートする。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, type VanillaContent } from './dom';

export type ButtonVariant = 'text' | 'outlined' | 'contained';
export type ButtonSize = 'small' | 'medium';

export interface CreateButtonProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** 先頭アイコン（button 内先頭に配置）。 */
  readonly startIcon?: Node;
  readonly children?: VanillaContent;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly title?: string;
  readonly onClick?: (e: MouseEvent) => void;
}

/**
 * MUI Button の vanilla 置換。
 *
 * @returns `HTMLButtonElement`
 */
export function createButton(props: Readonly<CreateButtonProps> = {}): HTMLButtonElement {
  injectGraphUiStyles();

  const variant: ButtonVariant = props.variant ?? 'text';
  const size: ButtonSize = props.size ?? 'medium';

  const classes = [
    'gv-btn',
    `gv-btn--${variant}`,
    size === 'small' ? 'gv-btn--small' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const el = document.createElement('button');
  el.type = props.type ?? 'button';
  el.className = classes;

  if (props.disabled) el.disabled = true;
  if (props.title !== undefined) el.title = props.title;

  if (props.startIcon) el.appendChild(props.startIcon);
  if (props.children !== undefined) appendContent(el, props.children);

  if (props.onClick) el.addEventListener('click', props.onClick as EventListener);

  return el;
}
