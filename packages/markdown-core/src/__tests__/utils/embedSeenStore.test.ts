import { markEmbedSeen, isEmbedSeen, __resetForTest } from "../../utils/embedSeenStore";

describe("embedSeenStore", () => {
    beforeEach(() => {
        __resetForTest();
    });

    test("isEmbedSeen returns false for unseen url", () => {
        expect(isEmbedSeen("https://example.com/a", "ogp:abc")).toBe(false);
    });

    test("isEmbedSeen returns true after markEmbedSeen with same fingerprint", () => {
        markEmbedSeen("https://example.com/a", "ogp:abc");
        expect(isEmbedSeen("https://example.com/a", "ogp:abc")).toBe(true);
    });

    test("isEmbedSeen returns false after markEmbedSeen with different fingerprint", () => {
        markEmbedSeen("https://example.com/a", "ogp:abc");
        expect(isEmbedSeen("https://example.com/a", "ogp:xyz")).toBe(false);
    });

    test("different urls are tracked independently", () => {
        markEmbedSeen("https://example.com/a", "ogp:abc");
        expect(isEmbedSeen("https://example.com/b", "ogp:abc")).toBe(false);
    });
});
