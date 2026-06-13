/**
 * `<anytime-markdown-view>` Custom Element — read-only・chromeless の最小 markdown 表示要素。
 *
 * {@link AnytimeMarkdownRichEditorElement} を継承し（mermaid/katex/code 等の rich 描画は維持）、
 * mount オプションを read-only + ツールバー/ステータスバー非表示に強制する。本文レンダリングだけが
 * 必要な表示専用途（report / docs 等の記事ビュー）向け。スクロール挙動（noScroll / fixedEditorHeight）
 * は consumer が options で指定する。
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
