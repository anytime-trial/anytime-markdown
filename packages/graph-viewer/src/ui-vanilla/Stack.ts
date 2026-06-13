/**
 * graph-viewer vanilla Stack ファクトリ。
 *
 * React 実装 `ui/Stack.tsx` の DOM 版。flex コンテナとして direction / spacing /
 * alignItems / justifyContent をインラインスタイルで適用する。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, type VanillaContent } from './dom';

export interface CreateStackProps {
  readonly direction?: 'row' | 'column';
  /** MUI spacing 互換。1 単位 = 8px の gap。 */
  readonly spacing?: number;
  readonly alignItems?: string;
  readonly justifyContent?: string;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly className?: string;
  readonly children?: VanillaContent;
}

/**
 * MUI Stack の vanilla 置換。flex コンテナ。
 *
 * @returns `HTMLDivElement`
 */
export function createStack(props: Readonly<CreateStackProps> = {}): HTMLDivElement {
  injectGraphUiStyles();

  const direction = props.direction ?? 'column';
  const spacing = props.spacing ?? 0;

  const el = document.createElement('div');
  if (props.className) el.className = props.className;

  el.style.display = 'flex';
  el.style.flexDirection = direction;
  if (spacing) el.style.gap = `${spacing * 8}px`;
  if (props.alignItems) el.style.alignItems = props.alignItems;
  if (props.justifyContent) el.style.justifyContent = props.justifyContent;

  // 追加のインラインスタイルをマージ（React の {...style} 相当）。
  if (props.style) {
    for (const [key, value] of Object.entries(props.style)) {
      if (value == null) continue;
      if (key.startsWith('--')) {
        el.style.setProperty(key, String(value));
      } else {
        (el.style as unknown as Record<string, string>)[key] = String(value);
      }
    }
  }

  if (props.children !== undefined) appendContent(el, props.children);

  return el;
}
