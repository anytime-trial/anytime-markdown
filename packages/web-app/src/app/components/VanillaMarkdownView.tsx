'use client';

/**
 * read-only・最小（chromeless）の markdown 表示を **Web Component
 * `<anytime-markdown-view>` 経由** で mount する web-app 用ラッパ（report / docs 記事ビュー向け）。
 *
 * `VanillaRichMarkdownEditor` と同じ仕組み（{@link VanillaMarkdownEditorMount} のライフサイクル流用 +
 * カスタム要素生成アダプタ）だが、tag が `anytime-markdown-view` のため read-only・ツールバー/
 * ステータスバー非表示が要素側で強制される。consumer は content（initialContent）と theme/locale だけ
 * 渡せばよい。
 */

import '@anytime-markdown/markdown-rich/src/view-element';
import {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from '@anytime-markdown/markdown-react-islands';

import { createWebComponentMount } from './markdownWebComponentMount';

const mountMarkdownView = createWebComponentMount('anytime-markdown-view');

export default function VanillaMarkdownView(
  props: Readonly<Omit<VanillaMarkdownEditorMountProps, 'mount'>>,
) {
  return <VanillaMarkdownEditorMount mount={mountMarkdownView} {...props} />;
}
