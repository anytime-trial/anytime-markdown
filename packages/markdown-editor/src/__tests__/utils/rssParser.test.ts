import { parseRssLatest } from "../../utils/rssParser";

const RSS_2 = `<?xml version="1.0"?>
<rss version="2.0">
    <channel>
        <title>Example</title>
        <item>
            <title>Latest</title>
            <guid>urn:uuid:latest</guid>
            <pubDate>Wed, 24 Apr 2026 10:00:00 +0000</pubDate>
        </item>
        <item>
            <title>Older</title>
            <guid>urn:uuid:older</guid>
            <pubDate>Tue, 23 Apr 2026 10:00:00 +0000</pubDate>
        </item>
    </channel>
</rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Example</title>
    <entry>
        <title>Latest</title>
        <id>urn:uuid:latest-atom</id>
        <updated>2026-04-24T10:00:00Z</updated>
    </entry>
</feed>`;

describe("parseRssLatest", () => {
    test("parses RSS 2.0 first item", () => {
        const r = parseRssLatest(RSS_2);
        expect(r).toEqual({
            guid: "urn:uuid:latest",
            pubDate: "2026-04-24T10:00:00.000Z",
            title: "Latest",
        });
    });

    test("parses Atom first entry", () => {
        const r = parseRssLatest(ATOM);
        expect(r).toEqual({
            guid: "urn:uuid:latest-atom",
            pubDate: "2026-04-24T10:00:00.000Z",
            title: "Latest",
        });
    });

    test("returns null for empty feed", () => {
        expect(parseRssLatest(`<rss version="2.0"><channel></channel></rss>`)).toBeNull();
    });

    test("returns null for invalid XML", () => {
        expect(parseRssLatest("<<<not xml>>>")).toBeNull();
    });
});
