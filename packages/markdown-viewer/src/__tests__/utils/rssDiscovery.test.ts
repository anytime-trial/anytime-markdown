import { discoverRssFeed } from "../../utils/rssDiscovery";

describe("discoverRssFeed", () => {
    test("returns absolute URL when link rel alternate with rss type is present", () => {
        const html = `<html><head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        </head></html>`;
        expect(discoverRssFeed(html, "https://example.com/page")).toBe("https://example.com/feed.xml");
    });

    test("returns atom feed when rss is absent", () => {
        const html = `<link rel="alternate" type="application/atom+xml" href="https://example.com/atom">`;
        expect(discoverRssFeed(html, "https://example.com/")).toBe("https://example.com/atom");
    });

    test("prefers rss over atom when both present", () => {
        const html = `
            <link rel="alternate" type="application/atom+xml" href="/atom">
            <link rel="alternate" type="application/rss+xml" href="/rss">`;
        expect(discoverRssFeed(html, "https://example.com/")).toBe("https://example.com/rss");
    });

    test("returns null when no feed link", () => {
        expect(discoverRssFeed("<html></html>", "https://example.com/")).toBeNull();
    });

    test("ignores malformed links without href", () => {
        expect(discoverRssFeed(`<link rel="alternate" type="application/rss+xml">`, "https://example.com/")).toBeNull();
    });

    test("ignores links with non-alternate rel", () => {
        const html = `<link rel="stylesheet" type="application/rss+xml" href="/feed.xml">`;
        expect(discoverRssFeed(html, "https://example.com/")).toBeNull();
    });
});
