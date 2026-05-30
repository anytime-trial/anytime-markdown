"use client";

import { MarkdownEditorPage } from "@anytime-markdown/markdown-core";
import { common, createLowlight } from "lowlight";
import type { ComponentProps } from "react";

import { CodeBlockWithMermaid } from "./codeBlockWithMermaid";
import { prepareDarkDiagramsForPrint } from "./pdf/prepareDarkDiagramsForPrint";

// markdown-core の editorExtensions と同一の lowlight 構成を rich 側で再現する。
// CodeBlockWithMermaid は CodeBlockLowlight を継承するため lowlight インスタンスが必要。
// math / mermaid / plantuml は NodeView 描画専用言語のため no-op 登録し、
// highlightAuto の誤検出を防ぐ (core editorExtensions と同じ扱い)。
const lowlight = createLowlight(common);
const noopGrammar = () => ({ name: "noop", contains: [] as never[] });
for (const lang of ["math", "mermaid", "plantuml"]) {
  lowlight.register(lang, noopGrammar);
}

/** rich の codeblock 描画拡張 (mermaid/katex/plantuml/graph/html/embed の NodeView 付き)。 */
const richCodeBlockExtension = CodeBlockWithMermaid.configure({
  lowlight,
  defaultLanguage: "plaintext",
});

export type RichMarkdownEditorPageProps = ComponentProps<typeof MarkdownEditorPage>;

/**
 * markdown-core の `MarkdownEditorPage` に rich の codeblock 描画拡張と
 * ダークモード PDF 図ライト化戦略を注入する薄ラッパー。
 *
 * 重量モジュール (mermaid/katex/jsxgraph/plotly/mathjs/plantuml) を使う描画は
 * 本コンポーネント経由でのみ読み込まれる。codeBlockExtension / prepareDarkDiagrams は
 * 呼び出し側が明示指定すれば上書きできる。
 */
export default function RichMarkdownEditorPage(props: Readonly<RichMarkdownEditorPageProps>) {
  return (
    <MarkdownEditorPage
      codeBlockExtension={richCodeBlockExtension}
      prepareDarkDiagrams={prepareDarkDiagramsForPrint}
      {...props}
    />
  );
}
