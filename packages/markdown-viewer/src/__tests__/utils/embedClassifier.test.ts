import { classifyEmbedUrl } from "../../utils/embedClassifier";

describe("classifyEmbedUrl", () => {
    test.each([
        ["https://www.youtube.com/watch?v=abc123", { kind: "youtube", videoId: "abc123" }],
        ["https://youtu.be/abc123", { kind: "youtube", videoId: "abc123" }],
        ["https://www.youtube.com/shorts/abc123", { kind: "youtube", videoId: "abc123" }],
        ["https://www.youtube.com/embed/abc123", { kind: "youtube", videoId: "abc123" }],
    ])("YouTube: %s", (url, expected) => {
        expect(classifyEmbedUrl(url as string)).toEqual(expected);
    });

    test.each([
        ["https://www.figma.com/file/XXX/name", "figma"],
        ["https://www.figma.com/design/XXX/name", "figma"],
        ["https://www.figma.com/proto/XXX/name", "figma"],
        ["https://www.figma.com/board/XXX/name", "figma"],
    ])("Figma: %s", (url, kind) => {
        expect(classifyEmbedUrl(url)?.kind).toBe(kind);
    });

    test.each([
        ["https://open.spotify.com/track/abc123", { kind: "spotify", type: "track", id: "abc123" }],
        ["https://open.spotify.com/album/abc123", { kind: "spotify", type: "album", id: "abc123" }],
        ["https://open.spotify.com/playlist/abc123", { kind: "spotify", type: "playlist", id: "abc123" }],
        ["https://open.spotify.com/episode/abc123", { kind: "spotify", type: "episode", id: "abc123" }],
        ["https://open.spotify.com/show/abc123", { kind: "spotify", type: "show", id: "abc123" }],
        ["https://open.spotify.com/artist/abc123", { kind: "spotify", type: "artist", id: "abc123" }],
    ])("Spotify: %s", (url, expected) => {
        expect(classifyEmbedUrl(url as string)).toEqual(expected);
    });

    test("Twitter / X", () => {
        expect(classifyEmbedUrl("https://twitter.com/user/status/123")?.kind).toBe("twitter");
        expect(classifyEmbedUrl("https://x.com/user/status/123")?.kind).toBe("twitter");
    });

    test("Draw.io", () => {
        expect(classifyEmbedUrl("https://drawio.com/abc")?.kind).toBe("drawio");
        expect(classifyEmbedUrl("https://app.diagrams.net/abc")?.kind).toBe("drawio");
        expect(classifyEmbedUrl("https://viewer.diagrams.net/abc")?.kind).toBe("drawio");
    });

    test("汎用 OGP", () => {
        expect(classifyEmbedUrl("https://example.com")?.kind).toBe("ogp");
    });

    test("無効 URL", () => {
        expect(classifyEmbedUrl("")).toBeNull();
        expect(classifyEmbedUrl("not a url")).toBeNull();
        expect(classifyEmbedUrl("ftp://example.com")).toBeNull();
        expect(classifyEmbedUrl("file:///etc/passwd")).toBeNull();
    });
});
