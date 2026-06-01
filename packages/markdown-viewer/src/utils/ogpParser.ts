import type { OgpData } from "../types/embedProvider";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const SKIP_BEFORE_NAME = new Set([" ", "\t", "\n", "\r", "/"]);
const NAME_TERMINATORS = new Set([" ", "\t", "\n", "\r", "=", ">"]);
const VALUE_TERMINATORS = new Set([" ", "\t", "\n", "\r", ">"]);

function skipWhile(tag: string, end: number, start: number, chars: Set<string>): number {
    let i = start;
    while (i < end && chars.has(tag[i])) i += 1;
    return i;
}

function readUntil(tag: string, end: number, start: number, terminators: Set<string>): number {
    let i = start;
    while (i < end && !terminators.has(tag[i])) i += 1;
    return i;
}

function parseQuotedValue(tag: string, end: number, start: number, quote: string): { value: string; next: number } {
    const valueStart = start + 1;
    let i = valueStart;
    while (i < end && tag[i] !== quote) i += 1;
    const value = tag.slice(valueStart, i);
    return { value, next: i < end ? i + 1 : i };
}

function parseUnquotedValue(tag: string, end: number, start: number): { value: string; next: number } {
    const next = readUntil(tag, end, start, VALUE_TERMINATORS);
    return { value: tag.slice(start, next), next };
}

function parseAttributeValue(tag: string, end: number, start: number): { value: string; next: number } {
    const quote = tag[start];
    if (quote === `"` || quote === "'") return parseQuotedValue(tag, end, start, quote);
    return parseUnquotedValue(tag, end, start);
}

function parseTagAttributes(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const end = tag.endsWith(">") ? tag.length - 1 : tag.length;

    // 先頭のタグ名をスキップ
    let i = readUntil(tag, end, 0, new Set([" "]));

    while (i < end) {
        i = skipWhile(tag, end, i, SKIP_BEFORE_NAME);
        if (i >= end) break;

        const nameStart = i;
        i = readUntil(tag, end, i, NAME_TERMINATORS);
        const name = tag.slice(nameStart, i).toLowerCase();
        if (!name) break;

        i = skipWhile(tag, end, i, WHITESPACE);
        if (i >= end || tag[i] !== "=") {
            attrs[name] = "";
            continue;
        }
        i = skipWhile(tag, end, i + 1, WHITESPACE);
        if (i >= end) {
            attrs[name] = "";
            break;
        }

        const parsed = parseAttributeValue(tag, end, i);
        attrs[name] = parsed.value;
        i = parsed.next;
    }

    return attrs;
}

function extractTitle(html: string): string | null {
    const lower = html.toLowerCase();
    const titleStart = lower.indexOf("<title");
    if (titleStart < 0) return null;
    const openEnd = html.indexOf(">", titleStart);
    if (openEnd < 0) return null;
    const closeStart = lower.indexOf("</title>", openEnd + 1);
    if (closeStart < 0) return null;
    return html.slice(openEnd + 1, closeStart).trim();
}

function findFirstTagAttributes(html: string, tagName: string, predicate: (attrs: Record<string, string>) => boolean): Record<string, string> | null {
    const lower = html.toLowerCase();
    const needle = `<${tagName}`;
    let from = 0;
    while (true) {
        const start = lower.indexOf(needle, from);
        if (start < 0) return null;
        const end = html.indexOf(">", start);
        if (end < 0) return null;
        const attrs = parseTagAttributes(html.slice(start, end + 1));
        if (predicate(attrs)) return attrs;
        from = end + 1;
    }
}

function extractMeta(html: string, attr: "property" | "name", key: string): string | null {
    const target = key.toLowerCase();
    const attrs = findFirstTagAttributes(
        html,
        "meta",
        (metaAttrs) => metaAttrs[attr]?.toLowerCase() === target && typeof metaAttrs.content === "string",
    );
    if (!attrs) return null;
    return attrs.content ?? null;
}

function extractIconHref(html: string): string | null {
    const attrs = findFirstTagAttributes(html, "link", (linkAttrs) => {
        const rel = (linkAttrs.rel ?? "").toLowerCase();
        const relTokens = rel
            .split(" ")
            .map((token) => token.trim())
            .filter(Boolean);
        return relTokens.includes("icon") && typeof linkAttrs.href === "string";
    });
    if (!attrs) return null;
    return attrs.href ?? null;
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
