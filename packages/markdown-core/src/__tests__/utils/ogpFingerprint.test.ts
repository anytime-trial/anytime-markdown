import { buildOgpFingerprint, buildRssFingerprint } from "../../utils/ogpFingerprint";

describe("buildOgpFingerprint", () => {
    test("returns stable hash for same ogp (ignoring favicon)", async () => {
        const a = await buildOgpFingerprint({
            url: "https://example.com/",
            title: "A",
            description: "B",
            image: "https://example.com/img.png",
            siteName: "S",
            favicon: null,
        });
        const b = await buildOgpFingerprint({
            url: "https://example.com/",
            title: "A",
            description: "B",
            image: "https://example.com/img.png",
            siteName: "S",
            favicon: "ignored",
        });
        expect(a).toBe(b);
        expect(a).toMatch(/^sha256:[a-f0-9]{16}$/);
    });

    test("differs when title changes", async () => {
        const a = await buildOgpFingerprint({
            url: "https://example.com/",
            title: "A",
            description: null,
            image: null,
            siteName: null,
            favicon: null,
        });
        const b = await buildOgpFingerprint({
            url: "https://example.com/",
            title: "B",
            description: null,
            image: null,
            siteName: null,
            favicon: null,
        });
        expect(a).not.toBe(b);
    });
});

describe("buildRssFingerprint", () => {
    test("returns rss:guid:pubDate", () => {
        expect(
            buildRssFingerprint({ guid: "urn:a", pubDate: "2026-04-24T00:00:00.000Z", title: "T" }),
        ).toBe("rss:urn:a:2026-04-24T00:00:00.000Z");
    });
});
