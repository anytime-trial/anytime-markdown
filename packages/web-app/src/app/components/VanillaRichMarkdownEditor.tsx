'use client';

/**
 * 脱React G3-2 / WC 化: rich markdown エディタを **Web Component
 * `<anytime-markdown-rich-editor>` 経由** で mount する web-app 用ラッパ。
 *
 * `dynamic(..., { ssr: false })` で遅延読込する前提のため、重量 rich モジュール
 * （mermaid/katex 等の遅延 import 起点）と Custom Element 登録は本ファイル経由でのみ静的参照する。
 *
 * ライフサイクル（mount-once / live props の handle.update / エラー fallback）は
 * `VanillaMarkdownEditorMount` をそのまま流用し、その `mount` だけをカスタム要素生成アダプタへ
 * 差し替える。これにより editor 実体が `<anytime-markdown-rich-editor>` として DOM に入る。
 * app レベルのフル options（fileSystemProvider / 各 callback / settings 等）は要素の
 * `options` プロパティ（escape hatch）で渡す。
 */

import '@anytime-markdown/markdown-rich/src/element';
import type { AnytimeMarkdownRichEditorElement } from '@anytime-markdown/markdown-rich/src/AnytimeMarkdownRichEditorElement';
import {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from '@anytime-markdown/markdown-react-islands';
import type {
  MountVanillaMarkdownEditorOptions,
  VanillaMarkdownEditorHandle,
} from '@anytime-markdown/markdown-viewer/src/host/vanillaMarkdownEditor';

/**
 * `<anytime-markdown-rich-editor>` を生成して container へ mount し、
 * {@link VanillaMarkdownEditorHandle} 互換のアダプタを返す。
 * connectedCallback は appendChild で同期的に発火するため、append 後に editor/root が確定する。
 */
function mountRichWebComponent(
  container: HTMLElement,
  options: MountVanillaMarkdownEditorOptions,
): VanillaMarkdownEditorHandle {
  const el = document.createElement(
    'anytime-markdown-rich-editor',
  ) as AnytimeMarkdownRichEditorElement;
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
}

export default function VanillaRichMarkdownEditor(
  props: Readonly<Omit<VanillaMarkdownEditorMountProps, 'mount'>>,
) {
  return <VanillaMarkdownEditorMount mount={mountRichWebComponent} {...props} />;
}
