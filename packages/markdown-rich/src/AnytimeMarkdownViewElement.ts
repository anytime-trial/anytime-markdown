/**
 * `<anytime-markdown-view>` Custom Element — read-only・chromeless の markdown 表示要素
 * （report / docs 等の記事ビュー向け）。
 *
 * {@link AnytimeMarkdownRichEditorElement} を継承し（mermaid/katex/code 等の rich 描画は維持）、
 * mount オプションを **read-only + ツールバー/ステータスバー非表示**に強制する。記事表示には
 * 編集ツールバー（保存/GitHub/表/レビュー・編集・ソース等）は不要なため、本文レンダリングだけを残す。
 * スクロール挙動（noScroll / fixedEditorHeight）は consumer が options で指定する。
 *
 * I/F は基底と同一（`value` プロパティ / `options` プロパティ / `theme`・`locale` 属性）。
 */

import {
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "@anytime-markdown/markdown-viewer";

import { AnytimeMarkdownRichEditorElement } from "./AnytimeMarkdownRichEditorElement";

export class AnytimeMarkdownViewElement extends AnytimeMarkdownRichEditorElement {
  protected override mountEditor(
    container: HTMLElement,
    options: MountVanillaMarkdownEditorOptions,
  ): VanillaMarkdownEditorHandle {
    // read-only・chromeless を強制（consumer 指定より優先）。スクロールは options 任せ。
    return super.mountEditor(container, {
      ...options,
      readOnly: true,
      hideToolbar: true,
      hideStatusBar: true,
    });
  }
}
