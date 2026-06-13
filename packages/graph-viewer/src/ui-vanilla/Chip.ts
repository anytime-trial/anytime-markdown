/**
 * graph-viewer vanilla Chip ファクトリ。
 *
 * React 実装 `ui/Chip.tsx` の DOM 版。gv-chip クラスは `ui/injectStyles.ts` 定義済み。
 * ラベル + 任意の削除ボタン（×アイコン）を生成する。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, applyStyle, type VanillaContent } from './dom';

export interface CreateChipProps {
  readonly label: VanillaContent;
  readonly size?: 'small' | 'medium';
  readonly onDelete?: () => void;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
}

/** 削除ボタン内の ×SVG（React 実装 Chip.tsx と同一パス）。 */
function deleteIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z',
  );
  svg.appendChild(path);
  return svg;
}

/**
 * MUI Chip の vanilla 置換（ラベル + 任意の削除ボタン）。
 *
 * @returns `HTMLSpanElement`
 */
export function createChip(props: Readonly<CreateChipProps>): HTMLSpanElement {
  injectGraphUiStyles();

  const classes = [
    'gv-chip',
    props.size === 'small' ? 'gv-chip--small' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const el = document.createElement('span');
  el.className = classes;
  if (props.style) applyStyle(el, props.style);

  appendContent(el, props.label);

  if (props.onDelete) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gv-chip__delete';
    btn.setAttribute('aria-label', 'Delete');
    btn.appendChild(deleteIcon());
    const handler = props.onDelete;
    btn.addEventListener('click', () => handler());
    el.appendChild(btn);
  }

  return el;
}
