export type EmbedKind =
    | { kind: "youtube"; videoId: string }
    | { kind: "figma"; path: string }
    | { kind: "spotify"; type: string; id: string }
    | { kind: "twitter"; url: string }
    | { kind: "drawio"; url: string }
    | { kind: "ogp"; url: string };

const SPOTIFY_TYPES = ["track", "album", "playlist", "episode", "show", "artist"];
const FIGMA_PREFIXES = ["/file/", "/design/", "/proto/", "/board/"];
const YT_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;
const SP_ID_RE = /^[A-Za-z0-9]{6,40}$/;

export function classifyEmbedUrl(raw: string): EmbedKind | null {
    let u: URL;
    try {
        u = new URL(raw.trim());
    } catch {
        return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
        const id = u.pathname.split("/")[1] ?? "";
        return YT_ID_RE.test(id) ? { kind: "youtube", videoId: id } : null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        if (u.pathname === "/watch") {
            const id = u.searchParams.get("v") ?? "";
            return YT_ID_RE.test(id) ? { kind: "youtube", videoId: id } : null;
        }
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts[0] === "shorts" && parts[1] && YT_ID_RE.test(parts[1])) {
            return { kind: "youtube", videoId: parts[1] };
        }
        if (parts[0] === "embed" && parts[1] && YT_ID_RE.test(parts[1])) {
            return { kind: "youtube", videoId: parts[1] };
        }
    }

    if (host === "figma.com" && FIGMA_PREFIXES.some((p) => u.pathname.startsWith(p))) {
        return { kind: "figma", path: u.pathname + u.search };
    }

    if (host === "open.spotify.com") {
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length >= 2 && SPOTIFY_TYPES.includes(parts[0]) && SP_ID_RE.test(parts[1])) {
            return { kind: "spotify", type: parts[0], id: parts[1] };
        }
    }

    if (host === "twitter.com" || host === "x.com") {
        if (/^\/[^/]+\/status\/\d+/.test(u.pathname)) {
            return { kind: "twitter", url: u.toString() };
        }
    }

    if (host === "drawio.com" || host === "app.diagrams.net" || host === "viewer.diagrams.net") {
        return { kind: "drawio", url: u.toString() };
    }

    return { kind: "ogp", url: u.toString() };
}
