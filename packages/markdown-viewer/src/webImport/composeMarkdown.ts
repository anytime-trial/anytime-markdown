import type { WebImportResult } from "./convertWebPageToMarkdown";

export function composeNewDocument(r: WebImportResult): string {
  return `---
source: ${r.sourceUrl}
title: ${r.title}
fetched: ${r.fetchedAt}
---

# ${r.title}

${r.markdownBody}`;
}

export function composeInsertSnippet(r: WebImportResult): string {
  return `## ${r.title}
> 出典: ${r.sourceUrl}

${r.markdownBody}`;
}
