import { common, createLowlight } from "lowlight";

/**
 * アプリ共通の lowlight インスタンス（シンタックスハイライト用）。
 *
 * common 文法に加え、NodeView 描画専用言語 (math / mermaid / plantuml) を no-op 登録して
 * highlightAuto の誤検出を防ぐ。
 *
 * markdown-core の `editorExtensions`（codeBlockExtension 未注入時のフォールバック
 * `CodeBlockLowlight`）と、markdown-rich の `RichMarkdownEditorPage`（`CodeBlockWithMermaid`）
 * が同一インスタンスを共有する。lowlight は読み取り専用のグラマレジストリであり共有して安全。
 */
export const appLowlight = createLowlight(common);

const noopGrammar = () => ({ name: "noop", contains: [] as never[] });
for (const lang of ["math", "mermaid", "plantuml"]) {
  appLowlight.register(lang, noopGrammar);
}
