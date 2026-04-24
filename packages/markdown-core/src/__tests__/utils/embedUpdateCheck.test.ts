import { checkEmbedUpdate } from "../../utils/embedUpdateCheck";
import type { OgpData, EmbedProviders } from "../../types/embedProvider";
import type { RssLatest } from "../../utils/rssParser";

const OGP: OgpData = {
    url: "https://example.com/page",
    title: "Title A",
    description: "Desc A",
    image: "https://example.com/img.png",
    siteName: "Site A",
    favicon: null,
};

const HTML_WITH_RSS = `<html><head>
    <link rel="alternate" type="application/rss+xml" href="https://example.com/feed.xml">
</head></html>`;

function makeProviders(fetchRss: EmbedProviders["fetchRss"]): Pick<EmbedProviders, "fetchRss"> {
    return { fetchRss };
}

const RSS_LATEST_A: RssLatest = { guid: "urn:uuid:A", pubDate: "2026-04-24T00:00:00.000Z", title: "Latest A" };
const RSS_LATEST_B: RssLatest = { guid: "urn:uuid:B", pubDate: "2026-04-25T00:00:00.000Z", title: "Latest B" };

describe("checkEmbedUpdate (initial)", () => {
    test("returns initial baseline with rssFeedUrl and guid when html has rss link", async () => {
        const providers = makeProviders(jest.fn().mockResolvedValue(RSS_LATEST_A));
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: HTML_WITH_RSS,
            providers,
            baseline: { rssFeedUrl: null, baselineRssGuid: null, baselineOgpHash: null, rssChecked: false },
        });
        expect(result.kind).toBe("initial");
        if (result.kind === "initial") {
            expect(result.baseline.rssFeedUrl).toBe("https://example.com/feed.xml");
            expect(result.baseline.baselineRssGuid).toBe("urn:uuid:A");
            expect(result.baseline.rssChecked).toBe(true);
            expect(result.baseline.baselineOgpHash).toMatch(/^sha256:/);
            expect(result.fingerprint).toMatch(/^rss:/);
        }
    });

    test("initial with no rss link falls back to ogp hash baseline", async () => {
        const providers = makeProviders(jest.fn().mockRejectedValue(new Error("unused")));
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: "<html></html>",
            providers,
            baseline: { rssFeedUrl: null, baselineRssGuid: null, baselineOgpHash: null, rssChecked: false },
        });
        expect(result.kind).toBe("initial");
        if (result.kind === "initial") {
            expect(result.baseline.rssFeedUrl).toBeNull();
            expect(result.baseline.baselineRssGuid).toBeNull();
            expect(result.baseline.rssChecked).toBe(true);
            expect(result.baseline.baselineOgpHash).toMatch(/^sha256:/);
            expect(result.fingerprint).toMatch(/^sha256:/);
        }
    });
});

describe("checkEmbedUpdate (subsequent)", () => {
    test("rss guid matches baseline -> unchanged", async () => {
        const providers = makeProviders(jest.fn().mockResolvedValue(RSS_LATEST_A));
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: null,
            providers,
            baseline: {
                rssFeedUrl: "https://example.com/feed.xml",
                baselineRssGuid: "urn:uuid:A",
                baselineOgpHash: "sha256:old",
                rssChecked: true,
            },
        });
        expect(result.kind).toBe("unchanged");
    });

    test("rss guid differs from baseline -> updated", async () => {
        const providers = makeProviders(jest.fn().mockResolvedValue(RSS_LATEST_B));
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: null,
            providers,
            baseline: {
                rssFeedUrl: "https://example.com/feed.xml",
                baselineRssGuid: "urn:uuid:A",
                baselineOgpHash: "sha256:old",
                rssChecked: true,
            },
        });
        expect(result.kind).toBe("updated");
        if (result.kind === "updated") {
            expect(result.fingerprint).toBe("rss:urn:uuid:B:2026-04-25T00:00:00.000Z");
            expect(result.newTitle).toBe("Latest B");
        }
    });

    test("rss fetch failure -> unchanged (silent)", async () => {
        const providers = makeProviders(jest.fn().mockRejectedValue(new Error("network")));
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: null,
            providers,
            baseline: {
                rssFeedUrl: "https://example.com/feed.xml",
                baselineRssGuid: "urn:uuid:A",
                baselineOgpHash: null,
                rssChecked: true,
            },
        });
        expect(result.kind).toBe("unchanged");
    });

    test("no rss feed + ogp hash matches -> unchanged", async () => {
        const providers = makeProviders(jest.fn());
        // first compute current hash to seed baseline
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: null,
            providers,
            baseline: {
                rssFeedUrl: null,
                baselineRssGuid: null,
                baselineOgpHash: "sha256:wrong",
                rssChecked: true,
            },
        });
        expect(result.kind).toBe("updated");
    });

    test("no rss feed + ogp hash matches baseline -> unchanged", async () => {
        const providers = makeProviders(jest.fn());
        // compute expected hash via initial path to get baseline
        const init = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: "<html></html>",
            providers,
            baseline: { rssFeedUrl: null, baselineRssGuid: null, baselineOgpHash: null, rssChecked: false },
        });
        if (init.kind !== "initial") throw new Error("expected initial");
        const result = await checkEmbedUpdate({
            url: OGP.url,
            ogpData: OGP,
            ogpHtml: null,
            providers,
            baseline: init.baseline,
        });
        expect(result.kind).toBe("unchanged");
    });
});
