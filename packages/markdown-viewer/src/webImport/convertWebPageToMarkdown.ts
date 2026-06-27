import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

const { gfm } = require("turndown-plugin-gfm") as {
  gfm: TurndownService.Plugin;
};

export interface WebImportResult {
  title: string;
  markdownBody: string;
  sourceUrl: string;
  byline?: string;
  fetchedAt: string;
}

export function convertWebPageToMarkdown(
  html: string,
  sourceUrl: string,
  now: Date,
): WebImportResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const article = new Readability(doc).parse();
  const turndown = createTurndownService();

  if (article === null) {
    console.warn(`[webImport] readability failed, fallback to body: ${sourceUrl}`);

    return {
      title: doc.title,
      markdownBody: turndown.turndown(doc.body?.innerHTML ?? ""),
      sourceUrl,
      fetchedAt: now.toISOString(),
    };
  }

  return {
    title: article.title ?? doc.title,
    markdownBody: turndown.turndown(article.content ?? ""),
    sourceUrl,
    ...(article.byline ? { byline: article.byline } : {}),
    fetchedAt: now.toISOString(),
  };
}

function createTurndownService(): TurndownService {
  const turndown = new TurndownService();
  turndown.use(gfm);
  return turndown;
}
