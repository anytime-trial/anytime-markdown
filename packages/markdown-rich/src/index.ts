// @anytime-markdown/markdown-rich
//
// markdown-core から分割した「重量外部モジュール (mermaid / katex / jsxgraph /
// plotly / mathjs / plantuml) を使うリッチ描画部品」を提供するパッケージ。
//
// tiptap エディタ本体 (MarkdownEditorPage) は markdown-core に残り、本パッケージは
// codeblock 描画ツリー (NodeView / 各 Block / 編集ダイアログ / レンダリング hooks) と
// それらを注入する RichMarkdownEditorPage を提供する。
//
// 実体の移動は段階的に行う (plan: 20260530-markdown-rich-split-design)。

// PDF 出力時のダークモード図ライト化戦略 (B-5: usePdfExport から注入される)
export { prepareDarkDiagramsForPrint } from "./pdf/prepareDarkDiagramsForPrint";
