import { DOMParser } from "@xmldom/xmldom";

export interface RssLatest {
    guid: string;
    pubDate: string;
    title: string;
}

function normalizeDate(raw: string | null | undefined): string {
    if (!raw) return new Date(0).toISOString();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
    return d.toISOString();
}

function text(el: Element | null | undefined, tag: string): string | null {
    if (!el) return null;
    const nodes = el.getElementsByTagName(tag);
    if (nodes.length === 0) return null;
    return nodes[0].textContent?.trim() ?? null;
}

export function parseRssLatest(xml: string): RssLatest | null {
    let doc: Document;
    try {
        doc = new DOMParser({
            errorHandler: () => undefined,
        }).parseFromString(xml, "text/xml") as unknown as Document;
    } catch {
        return null;
    }
    if (!doc?.documentElement) return null;

    const root = doc.documentElement;
    const rootTag = root.tagName.toLowerCase();

    if (rootTag === "rss") {
        const item = root.getElementsByTagName("item")[0];
        if (!item) return null;
        const guid = text(item as unknown as Element, "guid") ?? text(item as unknown as Element, "link");
        const pubDate = text(item as unknown as Element, "pubDate");
        const title = text(item as unknown as Element, "title") ?? "";
        if (!guid) return null;
        return { guid, pubDate: normalizeDate(pubDate), title };
    }

    if (rootTag === "feed") {
        const entry = root.getElementsByTagName("entry")[0];
        if (!entry) return null;
        const guid = text(entry as unknown as Element, "id");
        const pubDate = text(entry as unknown as Element, "updated") ?? text(entry as unknown as Element, "published");
        const title = text(entry as unknown as Element, "title") ?? "";
        if (!guid) return null;
        return { guid, pubDate: normalizeDate(pubDate), title };
    }

    return null;
}
