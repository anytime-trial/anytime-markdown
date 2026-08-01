import { markEmbedSeen, isEmbedSeen, __resetForTest } from "../../utils/embedSeenStore";

const STORAGE_KEY = "anytime-markdown:embedSeenStore:v1";

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

    test("markEmbedSeen with same fingerprint is idempotent (no re-persist)", () => {
        markEmbedSeen("https://example.com/a", "ogp:abc");
        markEmbedSeen("https://example.com/a", "ogp:abc");
        expect(isEmbedSeen("https://example.com/a", "ogp:abc")).toBe(true);
    });

    test("loads existing entries from localStorage on first access after reset", () => {
        // Pre-populate localStorage directly (cache=null after __resetForTest)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ "https://example.com/x": "fp:123" }));
        expect(isEmbedSeen("https://example.com/x", "fp:123")).toBe(true);
    });

    test("treats invalid JSON in localStorage as empty store", () => {
        localStorage.setItem(STORAGE_KEY, "{invalid-json");
        expect(isEmbedSeen("https://example.com/x", "fp:123")).toBe(false);
    });

    test("treats non-object JSON in localStorage as empty store", () => {
        localStorage.setItem(STORAGE_KEY, '"just-a-string"');
        expect(isEmbedSeen("https://example.com/x", "fp:123")).toBe(false);
    });

    test("evicts oldest entries when MAX_ENTRIES (500) is exceeded", () => {
        for (let i = 0; i <= 500; i++) {
            markEmbedSeen(`https://example.com/url-${i}`, `fp:${i}`);
        }
        // The 501st markEmbedSeen call should trigger eviction; url-0 should be gone
        expect(isEmbedSeen("https://example.com/url-0", "fp:0")).toBe(false);
        expect(isEmbedSeen("https://example.com/url-500", "fp:500")).toBe(true);
    });

    test("swallows localStorage write errors silently", () => {
        const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
            throw new Error("QuotaExceededError");
        });
        try {
            expect(() => markEmbedSeen("https://example.com/q", "fp:q")).not.toThrow();
        } finally {
            spy.mockRestore();
        }
    });

    test("swallows removeItem errors in __resetForTest", () => {
        const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
            throw new Error("SecurityError");
        });
        try {
            expect(() => __resetForTest()).not.toThrow();
        } finally {
            spy.mockRestore();
        }
    });

    test("works without localStorage (uses in-memory store only)", () => {
        // Temporarily hide localStorage to exercise the hasLocalStorage() === false branch
        const orig = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
        Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true, writable: true });
        try {
            __resetForTest(); // resets cache; removeItem skipped (no localStorage)
            markEmbedSeen("https://example.com/no-ls", "fp:1");
            expect(isEmbedSeen("https://example.com/no-ls", "fp:1")).toBe(true);
        } finally {
            if (orig) {
                Object.defineProperty(globalThis, "localStorage", orig);
            }
            __resetForTest();
        }
    });
});
