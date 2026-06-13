/**
 * `<anytime-markdown-view>` Custom Element — read-only の markdown 表示要素
 * （report / docs 等の記事ビュー向け）。
 *
 * {@link AnytimeMarkdownRichEditorElement} を継承し（mermaid/katex/code 等の rich 描画は維持）、
 * mount オプションを **read-only + viewerToolbar（フォントサイズ −/＋ と dark/light 切替のみの
 * 最小ツールバー）+ ステータスバー非表示**に強制する。編集系ツールバー（保存/GitHub/表/
 * レビュー・編集・ソース等）は出さず、閲覧者向けのフォント/テーマ操作だけを残す
 * （React 除去前の read-only 記事ビューの再現）。スクロールは consumer が options で指定する。
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
    // read-only + viewer 最小ツールバー（font/theme のみ）を強制。スクロールは options 任せ。
    return super.mountEditor(container, {
      ...options,
      readOnly: true,
      viewerToolbar: true,
      hideStatusBar: true,
    });
  }
}
