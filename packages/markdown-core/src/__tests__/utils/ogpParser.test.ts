import { parseOgpHtml } from "../../utils/ogpParser";

const baseUrl = "https://example.com/page";

describe("parseOgpHtml", () => {
    test("og:* 完備", () => {
        const html = `<html><head>
            <meta property="og:title" content="T">
            <meta property="og:description" content="D">
            <meta property="og:image" content="/img.png">
            <meta property="og:site_name" content="S">
            <link rel="icon" href="/fav.ico">
        </head></html>`;
        expect(parseOgpHtml(html, baseUrl)).toEqual({
            url: baseUrl,
            title: "T",
            description: "D",
            image: "https://example.com/img.png",
            siteName: "S",
            favicon: "https://example.com/fav.ico",
            rawHtml: html,
        });
    });

    test("twitter:* フォールバック", () => {
        const html = `<html><head>
            <meta name="twitter:title" content="TT">
            <meta name="twitter:description" content="TD">
            <meta name="twitter:image" content="https://cdn.example.com/img.png">
        </head></html>`;
        const r = parseOgpHtml(html, baseUrl);
        expect(r.title).toBe("TT");
        expect(r.description).toBe("TD");
        expect(r.image).toBe("https://cdn.example.com/img.png");
    });

    test("<title> フォールバック", () => {
        const html = `<html><head><title>Plain Title</title></head></html>`;
        expect(parseOgpHtml(html, baseUrl).title).toBe("Plain Title");
    });

    test("何もない", () => {
        const html = `<html><head></head></html>`;
        const r = parseOgpHtml(html, baseUrl);
        expect(r.title).toBeNull();
        expect(r.description).toBeNull();
        expect(r.image).toBeNull();
    });

    test("favicon デフォルト", () => {
        const html = `<html><head></head></html>`;
        expect(parseOgpHtml(html, baseUrl).favicon).toBe("https://example.com/favicon.ico");
    });
});
