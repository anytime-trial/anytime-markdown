/**
 * `<anytime-markdown-rich-editor>` Custom Element — markdown-viewer の
 * {@link AnytimeMarkdownEditorElement} を継承し、mount を rich 版
 * （{@link mountVanillaRichMarkdownEditor}・mermaid/katex/plantuml/math/embed 対応）へ差し替える。
 *
 * 属性 / プロパティ / イベントの I/F は基底クラスと同一。重量モジュール（mermaid 等）は
 * rich orchestrator 経由でのみ読み込まれる。
 *
 * 追加属性: `hide-graph`（jsxgraph/plotly 未バンドル環境で graph 機能を隠す）。
 */

import {
  AnytimeMarkdownEditorElement,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "@anytime-markdown/markdown-viewer";

import { mountVanillaRichMarkdownEditor } from "./vanilla/mountVanillaRichMarkdownEditor";

export class AnytimeMarkdownRichEditorElement extends AnytimeMarkdownEditorElement {
  protected override mountEditor(
    container: HTMLElement,
    options: MountVanillaMarkdownEditorOptions,
  ): VanillaMarkdownEditorHandle {
    return mountVanillaRichMarkdownEditor(container, {
      ...options,
      hideGraph: this.hasAttribute("hide-graph"),
    });
  }
}
