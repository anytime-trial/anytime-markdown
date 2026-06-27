import { normalizeUrl } from "./urlValidation";
import {
  convertWebPageToMarkdown,
  type WebImportResult,
} from "./convertWebPageToMarkdown";
import { type WebImportProvider } from "./webImportProvider";

export async function fetchAndConvert(
  rawUrl: string,
  provider: WebImportProvider,
  now: Date,
): Promise<WebImportResult> {
  const normalized = normalizeUrl(rawUrl);
  if (normalized === null) {
    throw new Error(`invalid url: ${rawUrl}`);
  }

  const { html, finalUrl } = await provider.fetch(normalized);
  return convertWebPageToMarkdown(html, finalUrl ?? normalized, now);
}
