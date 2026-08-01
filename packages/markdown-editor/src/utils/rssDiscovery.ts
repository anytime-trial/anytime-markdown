const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_RE = /\brel\s*=\s*["']?alternate["']?/i;
const TYPE_RE = /\btype\s*=\s*["']?(application\/(rss|atom)\+xml)["']?/i;
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/i;

function resolveUrl(href: string, base: string): string | null {
    try {
        return new URL(href, base).toString();
    } catch {
        return null;
    }
}

export function discoverRssFeed(html: string, baseUrl: string): string | null {
    const rssUrls: string[] = [];
    const atomUrls: string[] = [];

    const matches = html.match(LINK_TAG_RE) ?? [];
    for (const tag of matches) {
        if (!REL_RE.test(tag)) continue;
        const typeMatch = TYPE_RE.exec(tag);
        if (!typeMatch) continue;
        const hrefMatch = HREF_RE.exec(tag);
        if (!hrefMatch) continue;
        const abs = resolveUrl(hrefMatch[1], baseUrl);
        if (!abs) continue;
        if (typeMatch[2].toLowerCase() === "rss") rssUrls.push(abs);
        else atomUrls.push(abs);
    }

    return rssUrls[0] ?? atomUrls[0] ?? null;
}
