import type { OgpData } from "../types/embedProvider";

function extractMeta(html: string, attr: "property" | "name", key: string): string | null {
    const escapedKey = key.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
        `<meta\\s+[^>]*${attr}\\s*=\\s*["']${escapedKey}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
        "i",
    );
    const m1 = re.exec(html);
    if (m1) return m1[1];
    const re2 = new RegExp(
        `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attr}\\s*=\\s*["']${escapedKey}["']`,
        "i",
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
        extractMeta(html, "property", "og:title") ??
        extractMeta(html, "name", "twitter:title") ??
        extractTitle(html);
    const description =
        extractMeta(html, "property", "og:description") ??
        extractMeta(html, "name", "twitter:description") ??
        extractMeta(html, "name", "description");
    const rawImage =
        extractMeta(html, "property", "og:image") ??
        extractMeta(html, "name", "twitter:image");
    const siteName = extractMeta(html, "property", "og:site_name");
    const rawIcon = extractIconHref(html) ?? "/favicon.ico";

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
