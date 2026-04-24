export type EmbedVariant = "card" | "compact";

export interface EmbedInfoString {
    variant: EmbedVariant;
    width: string | null;
}

const WIDTH_RE = /^\d+(?:\.\d+)?(?:px|%)$/;

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

    for (const raw of parts.slice(1)) {
        if (raw === "card" || raw === "compact") {
            variant = raw;
            continue;
        }
        const w = parseWidthToken(raw);
        if (w) width = w;
    }

    return { variant, width };
}

export function buildEmbedInfoString(variant: EmbedVariant, width: string | null | undefined): string {
    const parts = ["embed", variant];
    if (width) parts.push(width);
    return parts.join(" ");
}
