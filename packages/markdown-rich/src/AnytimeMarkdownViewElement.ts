/**
 * `<anytime-markdown-view>` Custom Element — read-only の markdown 表示要素（report / docs 記事ビュー向け）。
 *
 * {@link AnytimeMarkdownRichEditorElement} を継承し（mermaid/katex/code 等の rich 描画は維持）、
 * mount オプションを **read-only に強制**する。ツールバー表示・ステータスバー・スクロール等の見た目は
 * React 除去前の viewer（`readOnly` + `hideStatusBar` + `noScroll`、ツールバーは表示）と一致させるため、
 * `hideToolbar` は強制しない（consumer が options で指定する）。
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
    // read-only のみ強制（consumer 指定より優先）。ツールバー/ステータスバー/スクロールは
    // React 除去前と同じ表示にするため options 任せ（hideToolbar は強制しない）。
    return super.mountEditor(container, {
      ...options,
      readOnly: true,
    });
  }
}
