export type EmbedVariant = "card" | "compact";

export interface EmbedBaseline {
    rssFeedUrl: string | null;
    baselineRssGuid: string | null;
    baselineOgpHash: string | null;
    rssChecked: boolean;
}

export const DEFAULT_EMBED_BASELINE: EmbedBaseline = Object.freeze({
    rssFeedUrl: null,
    baselineRssGuid: null,
    baselineOgpHash: null,
    rssChecked: false,
}) as EmbedBaseline;

export interface EmbedInfoString extends EmbedBaseline {
    variant: EmbedVariant;
    width: string | null;
}

const WIDTH_RE = /^\d+(?:\.\d+)?(?:px|%)$/;
const RSS_URL_RE = /^https?:\/\//;
const HASH_RE = /^(?:sha256:)?[a-f0-9]{8,64}$/i;

function parseWidthToken(token: string | undefined): string | null {
    if (!token) return null;
    if (WIDTH_RE.test(token)) return token;
    if (/^\d+(?:\.\d+)?$/.test(token)) return `${token}px`;
    return null;
}

export function parseEmbedInfoString(info: string): EmbedInfoString | null {
    const parts = info.trim().split(/\s+/);
    if (parts[0] !== "embed") return null;

    let variant: EmbedVariant = "card";
    let width: string | null = null;
    let rssFeedUrl: string | null = null;
    let baselineRssGuid: string | null = null;
    let baselineOgpHash: string | null = null;
    let rssChecked = false;

    for (const raw of parts.slice(1)) {
        if (raw === "card" || raw === "compact") {
            variant = raw;
            continue;
        }
        if (raw.startsWith("rss=")) {
            const v = raw.slice(4);
            rssChecked = true;
            rssFeedUrl = v === "none" ? null : RSS_URL_RE.test(v) ? v : null;
            continue;
        }
        if (raw.startsWith("guid=")) {
            baselineRssGuid = raw.slice(5);
            continue;
        }
        if (raw.startsWith("ogpHash=")) {
            const v = raw.slice(8);
            if (HASH_RE.test(v)) baselineOgpHash = v;
            continue;
        }
        const w = parseWidthToken(raw);
        if (w) {
            width = w;
            continue;
        }
    }

    return { variant, width, rssFeedUrl, baselineRssGuid, baselineOgpHash, rssChecked };
}

export function buildEmbedInfoString(
    variant: EmbedVariant,
    width: string | null | undefined,
    baseline?: EmbedBaseline,
): string {
    const parts = ["embed", variant];
    if (width) parts.push(width);
    if (baseline?.rssChecked) {
        parts.push(`rss=${baseline.rssFeedUrl ?? "none"}`);
    }
    if (baseline?.baselineRssGuid) parts.push(`guid=${baseline.baselineRssGuid}`);
    if (baseline?.baselineOgpHash) parts.push(`ogpHash=${baseline.baselineOgpHash}`);
    return parts.join(" ");
}
