"use client";

import { appLowlight, MarkdownEditorPage } from "@anytime-markdown/markdown-viewer";
import type { ComponentProps } from "react";

import { CodeBlockWithMermaid } from "./codeBlockWithMermaid";
import { prepareDarkDiagramsForPrint } from "./pdf/prepareDarkDiagramsForPrint";

/**
 * rich の codeblock 描画拡張 (mermaid/katex/plantuml/graph/html/embed の NodeView 付き)。
 * lowlight は core editorExtensions と共有の `appLowlight`
 * (common + math/mermaid/plantuml no-op 登録済み) を使い、インスタンス重複を避ける。
 */
const richCodeBlockExtension = CodeBlockWithMermaid.configure({
  lowlight: appLowlight,
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
