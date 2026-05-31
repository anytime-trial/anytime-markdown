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

type TokenUpdate = Partial<EmbedInfoString>;

function parseRssToken(value: string): TokenUpdate {
    const validUrl = RSS_URL_RE.test(value) ? value : null;
    const rssFeedUrl = value === "none" ? null : validUrl;
    return { rssChecked: true, rssFeedUrl };
}

function parseToken(raw: string): TokenUpdate | null {
    if (raw === "card" || raw === "compact") return { variant: raw };
    if (raw.startsWith("rss=")) return parseRssToken(raw.slice(4));
    if (raw.startsWith("guid=")) return { baselineRssGuid: raw.slice(5) };
    if (raw.startsWith("ogpHash=")) {
        const v = raw.slice(8);
        return HASH_RE.test(v) ? { baselineOgpHash: v } : null;
    }
    const w = parseWidthToken(raw);
    return w ? { width: w } : null;
}

export function parseEmbedInfoString(info: string): EmbedInfoString | null {
    const parts = info.trim().split(/\s+/);
    if (parts[0] !== "embed") return null;

    const result: EmbedInfoString = {
        variant: "card",
        width: null,
        rssFeedUrl: null,
        baselineRssGuid: null,
        baselineOgpHash: null,
        rssChecked: false,
    };
    for (const raw of parts.slice(1)) {
        const update = parseToken(raw);
        if (update) Object.assign(result, update);
    }

    return result;
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
