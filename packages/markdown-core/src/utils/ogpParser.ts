import type { OgpData } from "../types/embedProvider";

function parseTagAttributes(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const end = tag.endsWith(">") ? tag.length - 1 : tag.length;
    let i = 0;

    while (i < end && tag[i] !== " ") i += 1;
    while (i < end) {
        while (i < end && (tag[i] === " " || tag[i] === "\t" || tag[i] === "\n" || tag[i] === "\r" || tag[i] === "/")) i += 1;
        if (i >= end) break;

        const nameStart = i;
        while (i < end && tag[i] !== "=" && tag[i] !== " " && tag[i] !== "\t" && tag[i] !== "\n" && tag[i] !== "\r" && tag[i] !== ">") i += 1;
        const name = tag.slice(nameStart, i).toLowerCase();
        if (!name) break;

        while (i < end && (tag[i] === " " || tag[i] === "\t" || tag[i] === "\n" || tag[i] === "\r")) i += 1;
        if (i >= end || tag[i] !== "=") {
            attrs[name] = "";
            continue;
        }
        i += 1;
        while (i < end && (tag[i] === " " || tag[i] === "\t" || tag[i] === "\n" || tag[i] === "\r")) i += 1;
        if (i >= end) {
            attrs[name] = "";
            break;
        }

        let value = "";
        const quote = tag[i];
        if (quote === `"` || quote === "'") {
            i += 1;
            const valueStart = i;
            while (i < end && tag[i] !== quote) i += 1;
            value = tag.slice(valueStart, i);
            if (i < end && tag[i] === quote) i += 1;
        } else {
            const valueStart = i;
            while (i < end && tag[i] !== " " && tag[i] !== "\t" && tag[i] !== "\n" && tag[i] !== "\r" && tag[i] !== ">") i += 1;
            value = tag.slice(valueStart, i);
        }

        attrs[name] = value;
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
