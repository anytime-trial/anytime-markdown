const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

export interface WebFetchResult {
  html: string;
  finalUrl: string;
  contentType?: string;
}

export class WebFetchProxyError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = 'WebFetchProxyError';
  }
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function normalizeIpv6(hostname: string): string | null {
  const host = stripIpv6Brackets(hostname).toLowerCase();
  return host.includes(':') && /^[0-9a-f:.]+$/.test(host) ? host : null;
}

export function isBlockedHost(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, '');
  if (!host) return true;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  const ipv6 = normalizeIpv6(host);
  if (ipv6) {
    return (
      ipv6 === '::1' ||
      ipv6 === '0:0:0:0:0:0:0:1' ||
      ipv6.startsWith('fc') ||
      ipv6.startsWith('fd') ||
      ipv6.startsWith('fe8') ||
      ipv6.startsWith('fe9') ||
      ipv6.startsWith('fea') ||
      ipv6.startsWith('feb')
    );
  }

  return false;
}

export function assertSafeFetchUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebFetchProxyError('invalid_url', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebFetchProxyError('unsupported_scheme', 400);
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new WebFetchProxyError('blocked_host', 400);
  }
  return parsed;
}

export function assertSafeRedirectUrl(location: string, currentUrl: string): URL {
  let nextUrl: URL;
  try {
    nextUrl = new URL(location, currentUrl);
  } catch {
    throw new WebFetchProxyError('invalid_redirect_url', 400);
  }
  return assertSafeFetchUrl(nextUrl.toString());
}

function timeoutSignal(): AbortSignal {
  const withTimeout = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };
  if (typeof withTimeout.timeout === 'function') {
    return withTimeout.timeout(FETCH_TIMEOUT_MS);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return controller.signal;
}

function assertHtmlResponse(res: Response): string | undefined {
  if (!res.ok) {
    throw new WebFetchProxyError('upstream_error', 502);
  }

  const contentType = res.headers.get('content-type') ?? undefined;
  if (!contentType?.toLowerCase().includes('html')) {
    throw new WebFetchProxyError('unsupported_content_type', 415);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_HTML_BYTES) {
    throw new WebFetchProxyError('content_too_large', 413);
  }

  return contentType;
}

async function readLimitedText(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_HTML_BYTES) {
    throw new WebFetchProxyError('content_too_large', 413);
  }
  return new TextDecoder().decode(buffer);
}

export async function fetchWebPageForImport(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebFetchResult> {
  let currentUrl = assertSafeFetchUrl(url).toString();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let res: Response;
    try {
      res = await fetchImpl(currentUrl, {
        redirect: 'manual',
        signal: timeoutSignal(),
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'anytime-markdown-web-import/1.0',
        },
      });
    } catch {
      throw new WebFetchProxyError('fetch_failed', 502);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new WebFetchProxyError('redirect_missing_location', 502);
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new WebFetchProxyError('too_many_redirects', 508);
      }
      currentUrl = assertSafeRedirectUrl(location, currentUrl).toString();
      continue;
    }

    const contentType = assertHtmlResponse(res);
    const html = await readLimitedText(res);
    return { html, finalUrl: currentUrl, contentType };
  }

  throw new WebFetchProxyError('too_many_redirects', 508);
}
