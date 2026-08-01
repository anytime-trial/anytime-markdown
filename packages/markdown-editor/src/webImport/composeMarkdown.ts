import type { WebImportResult } from "./convertWebPageToMarkdown";

/**
 * 外部ページ由来の値（title / sourceUrl）を YAML フロントマターへ安全に直列化する。
 * コロン・改行・`---`・`key: value` 風文字列によるフロントマターインジェクションを防ぐため、
 * 二重引用符スカラとしてエスケープする。
 */
function yamlString(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}

export function composeNewDocument(r: WebImportResult): string {
  return `---
source: ${yamlString(r.sourceUrl)}
title: ${yamlString(r.title)}
fetched: ${yamlString(r.fetchedAt)}
---

# ${r.title}

${r.markdownBody}`;
}

export function composeInsertSnippet(r: WebImportResult): string {
  return `## ${r.title}
> 出典: ${r.sourceUrl}

${r.markdownBody}`;
}
