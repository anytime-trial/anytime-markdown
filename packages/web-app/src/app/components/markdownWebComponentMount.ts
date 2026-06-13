'use client';

/**
 * markdown 系 Custom Element（`<anytime-markdown-rich-editor>` / `<anytime-markdown-view>`）を
 * container へ生成 mount し、{@link VanillaMarkdownEditorHandle} 互換アダプタを返す共有ヘルパ。
 *
 * connectedCallback は appendChild で同期発火するため、append 後に editor/root が確定する。
 * 各ラッパは登録 import（副作用）を済ませたうえで該当タグ名を渡す。
 */

import type { AnytimeMarkdownEditorElement } from '@anytime-markdown/markdown-viewer/src/AnytimeMarkdownEditorElement';
import type {
  MountVanillaMarkdownEditorOptions,
  VanillaMarkdownEditorHandle,
} from '@anytime-markdown/markdown-viewer/src/host/vanillaMarkdownEditor';

export function createWebComponentMount(
  tagName: string,
): (container: HTMLElement, options: MountVanillaMarkdownEditorOptions) => VanillaMarkdownEditorHandle {
  return (container, options) => {
    const el = document.createElement(tagName) as AnytimeMarkdownEditorElement;
    el.options = options; // connect 前に渡すと mount 時にそのまま使われる
    container.appendChild(el);
    return {
      get editor() {
        return el.editor!;
      },
      get root() {
        return el.root!;
      },
      update: (patch) => el.update(patch),
      destroy: () => el.remove(),
    };
  };
}
