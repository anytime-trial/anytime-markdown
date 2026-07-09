import { convertWebPageToMarkdown } from "./convertWebPageToMarkdown";

const MD_EXT_RE = /\.(?:md|markdown)(?:$|[?#])/i;

export function isRawMarkdownPage(contentType: string, url: string): boolean {
  if (contentType === "text/markdown") return true;
  return contentType === "text/plain" && MD_EXT_RE.test(url);
}

export interface CapturedPage {
  markdown: string;
  title: string;
  sourceUrl: string;
}

/** content script 内（DOM あり）で実行する前提。 */
export function capturePageMarkdown(doc: Document, url: string, now: Date): CapturedPage {
  if (isRawMarkdownPage(doc.contentType, url)) {
    return { markdown: doc.body?.innerText ?? "", title: doc.title || url, sourceUrl: url };
  }
  const result = convertWebPageToMarkdown(doc.documentElement.outerHTML, url, now);
  return {
    markdown: result.markdownBody,
    title: result.title || doc.title || url,
    sourceUrl: url,
  };
}
