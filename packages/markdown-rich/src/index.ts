// @anytime-markdown/markdown-rich
//
// markdown-core から分割した「重量外部モジュール (mermaid / katex / jsxgraph /
// plotly / mathjs / plantuml) を使うリッチ描画部品」を提供するパッケージ。
//
// tiptap エディタ本体 (MarkdownEditorPage) は markdown-core に残り、本パッケージは
// native codeblock 描画ツリー (NodeView / 各 Block / レンダリング seam) と、それを
// 注入する vanilla orchestrator (mountVanillaRichMarkdownEditor) を提供する。
// 旧 React 経路 (RichMarkdownEditorPage / 各編集ダイアログ) は G4 で削除済み。
//
// 実体の移動は段階的に行う (plan: 20260530-markdown-rich-split-design)。

// codeblock 描画ツリー本体 (B-3+B-4 で markdown-core から物理移動)
// vanilla orchestrator が getBaseExtensions の codeBlockExtension に注入する拡張。
export { CodeBlockWithMermaid } from "./codeBlockWithMermaid";

// PDF 出力時のダークモード図ライト化戦略 (B-5: usePdfExport から注入される)
export { prepareDarkDiagramsForPrint } from "./pdf/prepareDarkDiagramsForPrint";

// vanilla 経路（脱React G3）: rich codeblock 注入済み orchestrator + overlay installer。
// 旧 React 経路（RichMarkdownEditorPage）は G4 で削除済み。consumer は
// mountVanillaRichMarkdownEditor へ一本化済み。
export {
  mountVanillaRichMarkdownEditor,
  type MountVanillaRichMarkdownEditorOptions,
} from "./vanilla/mountVanillaRichMarkdownEditor";
export {
  installCodeBlockOverlay,
  type InstallCodeBlockOverlayOptions,
} from "./vanilla/installCodeBlockOverlay";

// embed / graph プレビューの mount 契約型（実装は vanilla: viewer createEmbedPreview / rich createGraphPreview）。
export type { EmbedMountHandle, GraphMountHandle } from "./components/codeblock/previewContracts";

// Web Component（クラスのみ。customElements.define の副作用は "./element" / "./view-element" 側に置く）
export { AnytimeMarkdownRichEditorElement } from "./AnytimeMarkdownRichEditorElement";
export { AnytimeMarkdownViewElement } from "./AnytimeMarkdownViewElement";
