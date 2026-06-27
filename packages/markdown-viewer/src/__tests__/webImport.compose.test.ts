import type { WebImportResult } from "../webImport/convertWebPageToMarkdown";
import { composeInsertSnippet, composeNewDocument } from "../webImport/composeMarkdown";

const result: WebImportResult = {
  title: "Imported Article",
  markdownBody: "Article body",
  sourceUrl: "https://example.com/article",
  fetchedAt: "2026-06-27T00:00:00.000Z",
};

describe("web import markdown composition", () => {
  it("composes a new document with frontmatter and H1", () => {
    expect(composeNewDocument(result)).toBe(`---
source: https://example.com/article
title: Imported Article
fetched: 2026-06-27T00:00:00.000Z
---

# Imported Article

Article body`);
  });

  it("composes an insert snippet without frontmatter and with a source line", () => {
    expect(composeInsertSnippet(result)).toBe(`## Imported Article
> 出典: https://example.com/article

Article body`);
  });
});
