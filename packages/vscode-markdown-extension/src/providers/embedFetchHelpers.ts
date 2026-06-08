// Inlined OGP/SSRF helpers for VS Code extension host.
// Kept intentionally in sync with markdown-core/src/utils/{ogpParser, ssrfGuard}.
// See /Shared/anytime-markdown-docs/plan/20260424-embed-block-design.ja.md §6.

export interface OgpData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  rawHtml?: string | null;
}

export function isPrivateAddress(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  return false;
}

export async function assertSafeUrl(url: string): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('scheme-not-allowed');
  }
  const { lookup } = await import('node:dns/promises');
  const records = await lookup(u.hostname, { all: true });
  for (const r of records) {
    if (isPrivateAddress(r.address)) throw new Error('private-address');
  }
}

/**
 * SSRF ガード付き fetch。リダイレクトを手動追従し、各ホップの URL を assertSafeUrl で再検証する。
 * `redirect: 'follow'` のままだとリダイレクト先（例: 127.0.0.1 や 169.254.169.254）が
 * 検証されずにガードを迂回されるため、必ず本関数を経由する。
 *
 * 既知の残存リスク（DNS リバインディング TOCTOU）:
 * assertSafeUrl の dns.lookup と実際の TCP 接続の間に DNS レコードが差し替わると、
 * 検証時はパブリック IP・接続時はプライベート IP という rebinding 攻撃を完全には防げない。
 * 完全な対策には「検証した IP で接続を固定する」カスタム undici dispatcher が必要で、
 * 専用対応として別途実施する（本関数のリダイレクト再検証は緩和の一部）。
 */
export async function safeFetch(
  url: string,
  init: Readonly<RequestInit> = {},
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(currentUrl);
    const res = await fetch(currentUrl, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      // 相対 Location を絶対化し、次ループで再検証する
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error('too-many-redirects');
}

function extractMeta(html: string, attr: 'property' | 'name', key: string): string | null {
  const escapedKey = key.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta\\s+[^>]*${attr}\\s*=\\s*["']${escapedKey}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    'i',
  );
  const m1 = re.exec(html);
  if (m1) return m1[1];
  const re2 = new RegExp(
    `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attr}\\s*=\\s*["']${escapedKey}["']`,
    'i',
  );
  const m2 = re2.exec(html);
  return m2 ? m2[1] : null;
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}

function extractIconHref(html: string): string | null {
  const re = /<link\s+[^>]*rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*href\s*=\s*["']([^"']*)["']/i;
  const m = re.exec(html);
  if (m) return m[1];
  const re2 = /<link\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*rel\s*=\s*["'](?:shortcut\s+)?icon["']/i;
  const m2 = re2.exec(html);
  return m2 ? m2[1] : null;
}

function absolutize(maybeUrl: string | null, base: string): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

export function parseOgpHtml(html: string, baseUrl: string): OgpData {
  const title =
    extractMeta(html, 'property', 'og:title') ??
    extractMeta(html, 'name', 'twitter:title') ??
    extractTitle(html);
  const description =
    extractMeta(html, 'property', 'og:description') ??
    extractMeta(html, 'name', 'twitter:description') ??
    extractMeta(html, 'name', 'description');
  const rawImage =
    extractMeta(html, 'property', 'og:image') ??
    extractMeta(html, 'name', 'twitter:image');
  const siteName = extractMeta(html, 'property', 'og:site_name');
  const rawIcon = extractIconHref(html) ?? '/favicon.ico';

  return {
    url: baseUrl,
    title,
    description,
    image: absolutize(rawImage, baseUrl),
    siteName,
    favicon: absolutize(rawIcon, baseUrl),
    rawHtml: html,
  };
}
