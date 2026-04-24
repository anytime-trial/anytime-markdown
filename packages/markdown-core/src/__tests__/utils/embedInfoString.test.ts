import { buildEmbedInfoString, parseEmbedInfoString } from "../../utils/embedInfoString";

const BASELINE_DEFAULTS = {
    rssFeedUrl: null,
    baselineRssGuid: null,
    baselineOgpHash: null,
    rssChecked: false,
} as const;

describe("parseEmbedInfoString", () => {
    test("default variant", () => {
        expect(parseEmbedInfoString("embed")).toEqual({ variant: "card", width: null, ...BASELINE_DEFAULTS });
    });
    test("card", () => {
        expect(parseEmbedInfoString("embed card")).toEqual({ variant: "card", width: null, ...BASELINE_DEFAULTS });
    });
    test("compact", () => {
        expect(parseEmbedInfoString("embed compact")).toEqual({ variant: "compact", width: null, ...BASELINE_DEFAULTS });
    });
    test("空白複数", () => {
        expect(parseEmbedInfoString("embed   compact")).toEqual({ variant: "compact", width: null, ...BASELINE_DEFAULTS });
    });
    test("非 embed", () => {
        expect(parseEmbedInfoString("typescript")).toBeNull();
    });
    test("不正 variant はデフォルト", () => {
        expect(parseEmbedInfoString("embed wide")).toEqual({ variant: "card", width: null, ...BASELINE_DEFAULTS });
    });
    test("card + width px", () => {
        expect(parseEmbedInfoString("embed card 512px")).toEqual({ variant: "card", width: "512px", ...BASELINE_DEFAULTS });
    });
    test("compact + width", () => {
        expect(parseEmbedInfoString("embed compact 300px")).toEqual({ variant: "compact", width: "300px", ...BASELINE_DEFAULTS });
    });
    test("width 単独 (variant 省略)", () => {
        expect(parseEmbedInfoString("embed 640px")).toEqual({ variant: "card", width: "640px", ...BASELINE_DEFAULTS });
    });
    test("数字のみは px 付与", () => {
        expect(parseEmbedInfoString("embed card 512")).toEqual({ variant: "card", width: "512px", ...BASELINE_DEFAULTS });
    });
    test("% も許容", () => {
        expect(parseEmbedInfoString("embed card 80%")).toEqual({ variant: "card", width: "80%", ...BASELINE_DEFAULTS });
    });
    test("順序入れ替え OK", () => {
        expect(parseEmbedInfoString("embed 512px compact")).toEqual({ variant: "compact", width: "512px", ...BASELINE_DEFAULTS });
    });
});

describe("buildEmbedInfoString", () => {
    test("card + null width", () => {
        expect(buildEmbedInfoString("card", null)).toBe("embed card");
    });
    test("compact + null width", () => {
        expect(buildEmbedInfoString("compact", null)).toBe("embed compact");
    });
    test("card + width", () => {
        expect(buildEmbedInfoString("card", "512px")).toBe("embed card 512px");
    });
    test("ラウンドトリップ", () => {
        const parsed = parseEmbedInfoString("embed compact 320px");
        expect(parsed).not.toBeNull();
        if (parsed) {
            expect(buildEmbedInfoString(parsed.variant, parsed.width)).toBe("embed compact 320px");
        }
    });
});

describe("parseEmbedInfoString baseline fields", () => {
    test("parses rss feed url", () => {
        const result = parseEmbedInfoString("embed card rss=https://example.com/feed.xml");
        expect(result?.rssFeedUrl).toBe("https://example.com/feed.xml");
        expect(result?.rssChecked).toBe(true);
    });

    test("parses baselineRssGuid", () => {
        const result = parseEmbedInfoString("embed card guid=urn:uuid:abc");
        expect(result?.baselineRssGuid).toBe("urn:uuid:abc");
    });

    test("parses baselineOgpHash", () => {
        const result = parseEmbedInfoString("embed card ogpHash=sha256:deadbeef");
        expect(result?.baselineOgpHash).toBe("sha256:deadbeef");
    });

    test("parses rss=none as null feed with rssChecked=true", () => {
        const result = parseEmbedInfoString("embed card rss=none");
        expect(result?.rssFeedUrl).toBeNull();
        expect(result?.rssChecked).toBe(true);
    });

    test("defaults baseline fields to null / rssChecked to false", () => {
        const result = parseEmbedInfoString("embed card");
        expect(result?.rssFeedUrl).toBeNull();
        expect(result?.baselineRssGuid).toBeNull();
        expect(result?.baselineOgpHash).toBeNull();
        expect(result?.rssChecked).toBe(false);
    });
});

describe("buildEmbedInfoString baseline fields", () => {
    test("serializes rss feed url and guid", () => {
        const s = buildEmbedInfoString("card", null, {
            rssFeedUrl: "https://example.com/feed.xml",
            baselineRssGuid: "urn:uuid:abc",
            baselineOgpHash: null,
            rssChecked: true,
        });
        expect(s).toContain("rss=https://example.com/feed.xml");
        expect(s).toContain("guid=urn:uuid:abc");
    });

    test("serializes rss=none and ogpHash when rssChecked=true and rssFeedUrl=null", () => {
        const s = buildEmbedInfoString("card", null, {
            rssFeedUrl: null,
            baselineRssGuid: null,
            baselineOgpHash: "sha256:xyz",
            rssChecked: true,
        });
        expect(s).toContain("rss=none");
        expect(s).toContain("ogpHash=sha256:xyz");
    });

    test("omits all baseline tokens when rssChecked=false and no fields", () => {
        const s = buildEmbedInfoString("card", "640px", {
            rssFeedUrl: null,
            baselineRssGuid: null,
            baselineOgpHash: null,
            rssChecked: false,
        });
        expect(s).toBe("embed card 640px");
    });

    test("ラウンドトリップ (baseline 含む)", () => {
        const input = "embed compact 320px rss=https://example.com/feed.xml guid=urn:uuid:x ogpHash=sha256:abc123def";
        const parsed = parseEmbedInfoString(input);
        expect(parsed).not.toBeNull();
        if (parsed) {
            const rebuilt = buildEmbedInfoString(parsed.variant, parsed.width, {
                rssFeedUrl: parsed.rssFeedUrl,
                baselineRssGuid: parsed.baselineRssGuid,
                baselineOgpHash: parsed.baselineOgpHash,
                rssChecked: parsed.rssChecked,
            });
            expect(rebuilt).toBe(input);
        }
    });
});
