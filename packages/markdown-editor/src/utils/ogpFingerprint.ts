import type { OgpData } from "../types/embedProvider";
import type { RssLatest } from "./rssParser";

async function sha256Hex(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const buf = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(input));
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
}

export async function buildOgpFingerprint(ogp: OgpData): Promise<string> {
    const src = [ogp.title ?? "", ogp.description ?? "", ogp.image ?? "", ogp.siteName ?? ""].join("\n");
    const hex = await sha256Hex(src);
    return `sha256:${hex.slice(0, 16)}`;
}

export function buildRssFingerprint(rss: RssLatest): string {
    return `rss:${rss.guid}:${rss.pubDate}`;
}
