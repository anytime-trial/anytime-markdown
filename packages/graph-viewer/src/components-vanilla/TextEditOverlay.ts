/**
 * TextEditOverlay の vanilla DOM factory。
 *
 * React 版 `components/TextEditOverlay.tsx` の DOM 置換。
 * canvas 上に inline textarea を配置し、Enter/blur でコミット、Escape でキャンセル。
 * ノード座標は worldToScreen で変換し、textarea を絶対配置する。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import { worldToScreen } from '@anytime-markdown/graph-core/engine';
import type { GraphNode, Viewport } from '../types';

export interface TextEditOverlayOptions {
  /** コミットコールバック（id・確定テキスト）。 */
  readonly onCommit: (id: string, text: string) => void;
  /** キャンセルコールバック。 */
  readonly onCancel: () => void;
  /** テーマ。既定 'dark'。 */
  readonly themeMode?: 'light' | 'dark';
}

export interface TextEditOverlayHandle {
  /**
   * textarea 要素。canvas の親コンテナへ追加して使う。
   * position:absolute で canvas に重ねるため、親は position:relative 等にする。
   */
  readonly el: HTMLTextAreaElement;
  /**
   * 指定ノード・ビューポートで textarea を表示しフォーカスする。
   * appendMode=true のとき末尾にカーソルを置く。false（既定）のとき全選択。
   */
  show(node: GraphNode, viewport: Viewport, appendMode?: boolean): void;
  /** textarea を非表示にする（display:none）。 */
  hide(): void;
  /** イベントリスナーを解放する。 */
  destroy(): void;
}

/**
 * canvas 上 inline textarea を生成する。
 *
 * @returns {@link TextEditOverlayHandle}
 */
export function createTextEditOverlay(opts: Readonly<TextEditOverlayOptions>): TextEditOverlayHandle {
  const isDark = (opts.themeMode ?? 'dark') === 'dark';
  const colors = getCanvasColors(isDark);

  // ---- closure 状態 ----
  let currentNode: GraphNode | null = null;

  // ---- textarea 生成 ----
  const ta = document.createElement('textarea');
  ta.style.cssText = [
    'position:absolute',
    'box-sizing:border-box',
    `border:2px solid ${colors.accentColor}`,
    'border-radius:2px',
    'outline:none',
    'resize:none',
    'padding:4px 8px',
    'background:transparent',
    `color:${colors.textPrimary}`,
    'z-index:30',
    'overflow:hidden',
    'text-align:center',
    'display:none',
  ].join(';');

  // ---- blur ----
  const onBlur = (): void => {
    if (currentNode) {
      opts.onCommit(currentNode.id, ta.value);
    }
  };

  // ---- keydown ----
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      opts.onCancel();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onBlur();
    }
    e.stopPropagation();
  };

  ta.addEventListener('blur', onBlur);
  ta.addEventListener('keydown', onKeyDown);

  return {
    el: ta,

    show(node: GraphNode, viewport: Viewport, appendMode = false): void {
      currentNode = node;

      const screen = worldToScreen(viewport, node.x, node.y);
      const w = node.width * viewport.scale;
      const h = node.height * viewport.scale;
      const fontSize = node.style.fontSize * viewport.scale;

      ta.style.left = `${screen.x}px`;
      ta.style.top = `${screen.y}px`;
      ta.style.width = `${w}px`;
      ta.style.height = `${h}px`;
      ta.style.fontSize = `${fontSize}px`;
      ta.style.fontFamily = node.style.fontFamily;
      ta.style.display = '';

      ta.value = node.text ?? '';
      ta.focus();

      if (appendMode) {
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      } else {
        ta.select();
      }
    },

    hide(): void {
      currentNode = null;
      ta.style.display = 'none';
    },

    destroy(): void {
      ta.removeEventListener('blur', onBlur);
      ta.removeEventListener('keydown', onKeyDown);
      currentNode = null;
    },
  };
}
