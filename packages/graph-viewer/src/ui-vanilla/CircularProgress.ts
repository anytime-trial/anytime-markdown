/**
 * graph-viewer vanilla CircularProgress ファクトリ。
 *
 * React 実装 `ui/CircularProgress.tsx` の DOM 版。gv-spinner クラスは
 * `ui/injectStyles.ts` 定義済み（CSS アニメーションの不確定スピナー）。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { applyStyle } from './dom';

export interface CreateCircularProgressProps {
  /** スピナーの直径（px）。既定 24。 */
  readonly size?: number;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
}

/**
 * MUI CircularProgress の vanilla 置換（不確定スピナー）。
 *
 * @returns `HTMLSpanElement`（role="progressbar"）
 */
export function createCircularProgress(
  props: Readonly<CreateCircularProgressProps> = {},
): HTMLSpanElement {
  injectGraphUiStyles();

  const size = props.size ?? 24;
  const classes = ['gv-spinner', props.className ?? ''].filter(Boolean).join(' ');

  const el = document.createElement('span');
  el.className = classes;
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-label', 'loading');

  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  if (props.style) applyStyle(el, props.style);

  return el;
}
