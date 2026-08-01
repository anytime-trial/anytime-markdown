type EmbedKind =
    | { kind: "youtube"; videoId: string }
    | { kind: "figma"; path: string }
    | { kind: "spotify"; type: string; id: string }
    | { kind: "twitter"; url: string }
    | { kind: "drawio"; url: string }
    | { kind: "ogp"; url: string };

const SPOTIFY_TYPES = new Set(["track", "album", "playlist", "episode", "show", "artist"]);
const FIGMA_PREFIXES = ["/file/", "/design/", "/proto/", "/board/"];
const YT_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;
const SP_ID_RE = /^[A-Za-z0-9]{6,40}$/;

type HostMatcher = (u: URL, host: string) => EmbedKind | null;

function classifyYouTubeShortPath(parts: string[]): EmbedKind | null {
    const id = parts[1];
    if (!id || !YT_ID_RE.test(id)) return null;
    return parts[0] === "shorts" || parts[0] === "embed"
        ? { kind: "youtube", videoId: id }
        : null;
}

function classifyYouTube(u: URL, host: string): EmbedKind | null {
    if (host === "youtu.be") {
        const id = u.pathname.split("/")[1] ?? "";
        return YT_ID_RE.test(id) ? { kind: "youtube", videoId: id } : null;
    }
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
    if (u.pathname === "/watch") {
        const id = u.searchParams.get("v") ?? "";
        return YT_ID_RE.test(id) ? { kind: "youtube", videoId: id } : null;
    }
    return classifyYouTubeShortPath(u.pathname.split("/").filter(Boolean));
}

function classifyFigma(u: URL, host: string): EmbedKind | null {
    if (host !== "figma.com") return null;
    return FIGMA_PREFIXES.some((p) => u.pathname.startsWith(p))
        ? { kind: "figma", path: u.pathname + u.search }
        : null;
}

function classifySpotify(u: URL, host: string): EmbedKind | null {
    if (host !== "open.spotify.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (!SPOTIFY_TYPES.has(parts[0])) return null;
    if (!SP_ID_RE.test(parts[1])) return null;
    return { kind: "spotify", type: parts[0], id: parts[1] };
}

function classifyTwitter(u: URL, host: string): EmbedKind | null {
    if (host !== "twitter.com" && host !== "x.com") return null;
    return /^\/[^/]+\/status\/\d+/.test(u.pathname)
        ? { kind: "twitter", url: u.toString() }
        : null;
}

function classifyDrawio(u: URL, host: string): EmbedKind | null {
    const drawioHosts = ["drawio.com", "app.diagrams.net", "viewer.diagrams.net"];
    return drawioHosts.includes(host) ? { kind: "drawio", url: u.toString() } : null;
}

const HOST_MATCHERS: readonly HostMatcher[] = [
    classifyYouTube,
    classifyFigma,
    classifySpotify,
    classifyTwitter,
    classifyDrawio,
];

export function classifyEmbedUrl(raw: string): EmbedKind | null {
    let u: URL;
    try {
        u = new URL(raw.trim());
    } catch {
        return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    const host = u.hostname.replace(/^www\./, "");
    for (const matcher of HOST_MATCHERS) {
        const result = matcher(u, host);
        if (result) return result;
    }
    return { kind: "ogp", url: u.toString() };
}
