/**
 * `@anytime-markdown/markdown-view` 公開エントリ（figure 同梱）。
 * import すると `<anytime-markdown-view>`（read-only・mermaid/katex/plantuml/math/chart/graph 対応）が登録される。
 */
import "@anytime-markdown/markdown-rich-editor/view-element";

// 要素クラスは rich（figure 同梱版）から、change イベント型は正本の markdown-editor から。
// （markdown-rich-editor の index は MarkdownChangeDetail を re-export しないため）
export { AnytimeMarkdownViewElement } from "@anytime-markdown/markdown-rich-editor";
export type { MarkdownChangeDetail } from "@anytime-markdown/markdown-editor";
