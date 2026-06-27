import type {
  WebImportFetchResult,
  WebImportProvider,
} from '@anytime-markdown/markdown-viewer/src/webImport/webImportProvider';

const WEB_IMPORT_PROXY_URL = process.env.NEXT_PUBLIC_WEB_IMPORT_PROXY_URL?.replace(/\/+$/, '');

interface WebImportProxyResponse {
  html?: unknown;
  finalUrl?: unknown;
  contentType?: unknown;
  error?: unknown;
}

export function createWebImportProvider(baseUrl = WEB_IMPORT_PROXY_URL): WebImportProvider | null {
  if (!baseUrl) return null;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    async fetch(url: string): Promise<WebImportFetchResult> {
      const res = await fetch(`${normalizedBaseUrl}/fetch?url=${encodeURIComponent(url)}`, {
        method: 'GET',
      });
      const data = (await res.json().catch(() => ({}))) as WebImportProxyResponse;
      if (!res.ok || data.error) {
        throw new Error(typeof data.error === 'string' ? data.error : `web_import_fetch_failed_${res.status}`);
      }
      if (typeof data.html !== 'string' || typeof data.finalUrl !== 'string') {
        throw new Error('web_import_invalid_response');
      }

      const result: WebImportFetchResult = {
        html: data.html,
        finalUrl: data.finalUrl,
      };
      if (typeof data.contentType === 'string') {
        result.contentType = data.contentType;
      }
      return result;
    },
  };
}

export function buildMarkdownDownloadName(title: string): string {
  const name = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${name || 'web-import'}.md`;
}

export function downloadMarkdownBlob(markdown: string, title: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = buildMarkdownDownloadName(title);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
