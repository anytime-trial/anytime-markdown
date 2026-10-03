'use client';

/**
 * markdown 系 Custom Element（`<anytime-markdown-rich-editor>` / `<anytime-markdown-view>`）を
 * container へ生成 mount し、{@link VanillaMarkdownEditorHandle} 互換アダプタを返す共有ヘルパ。
 *
 * connectedCallback は appendChild で同期発火するため、append 後に editor/root が確定する。
 * 各ラッパは登録 import（副作用）を済ませたうえで該当タグ名を渡す。
 */

import type { AnytimeMarkdownEditorElement } from '@anytime-markdown/markdown-editor';
import type {
  MountVanillaMarkdownEditorOptions,
  VanillaMarkdownEditorHandle,
} from '@anytime-markdown/markdown-editor/host/mount';

export interface WebComponentMountOptions {
  /**
   * 本文が他者・外部由来（S3 上の記事など）のとき true。本文を描画するノードに信頼境界属性
   * `data-untrusted-content="true"` を付ける（spec/35.mcp/04.tool-irreversibility「境界属性」。
   * サニタイズの代替ではない）。`<anytime-markdown-view>` は chromeless なので要素自体、
   * rich editor はツールバー等の一次者 UI を含むため ProseMirror の本文 DOM に付ける。
   */
  readonly untrustedContent?: boolean;
}

/** 信頼境界属性を付ける最小の親を返す（本文ノードが取れない場合は要素自体へ縮退）。 */
export function resolveUntrustedContentTarget(
  tagName: string,
  el: AnytimeMarkdownEditorElement,
): HTMLElement {
  if (tagName === 'anytime-markdown-view') return el;
  return el.editor?.view?.dom ?? el.root ?? el;
}

export function createWebComponentMount(
  tagName: string,
  mountOptions: WebComponentMountOptions = {},
): (container: HTMLElement, options: MountVanillaMarkdownEditorOptions) => VanillaMarkdownEditorHandle {
  return (container, options) => {
    const el = document.createElement(tagName) as AnytimeMarkdownEditorElement;
    el.options = options; // connect 前に渡すと mount 時にそのまま使われる
    container.appendChild(el);
    if (mountOptions.untrustedContent) {
      resolveUntrustedContentTarget(tagName, el).dataset.untrustedContent = 'true';
    }
    return {
      get editor() {
        return el.editor!;
      },
      get root() {
        return el.root!;
      },
      update: (patch) => el.update(patch),
      setAgentEdits: (targets) => el.setAgentEdits(targets),
      clearAgentEdits: () => el.clearAgentEdits(),
      destroy: () => el.remove(),
    };
  };
}
