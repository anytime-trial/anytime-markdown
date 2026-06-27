const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const MARKDOWN_PATH_RE = /\.(?:md|markdown)$/i;

export function isMarkdownHref(href: string): boolean {
  const trimmedHref = href.trim();
  if (!trimmedHref) return false;
  if (SCHEME_RE.test(trimmedHref)) return false;
  if (trimmedHref.startsWith("//")) return false;

  const pathEnd = findFirstSeparator(trimmedHref);
  const pathPart = pathEnd === -1 ? trimmedHref : trimmedHref.slice(0, pathEnd);
  if (!pathPart) return false;

  return MARKDOWN_PATH_RE.test(pathPart);
}

function findFirstSeparator(value: string): number {
  const queryIndex = value.indexOf("?");
  const anchorIndex = value.indexOf("#");

  if (queryIndex === -1) return anchorIndex;
  if (anchorIndex === -1) return queryIndex;
  return Math.min(queryIndex, anchorIndex);
}
