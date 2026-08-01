import { EmbedCache } from "../../utils/embedCache";

const emptyOgp = {
    url: "https://a",
    title: "t",
    description: null,
    image: null,
    siteName: null,
    favicon: null,
};

describe("EmbedCache", () => {
    beforeEach(() => localStorage.clear());

    test("set/get", () => {
        const c = new EmbedCache();
        c.set("https://a", emptyOgp);
        expect(c.get("https://a")?.url).toBe("https://a");
        expect((c.get("https://a") as { title: string }).title).toBe("t");
    });

    test("TTL 切れ", () => {
        const c = new EmbedCache({ ttlMs: 100 });
        c.set("https://a", emptyOgp);
        const realNow = Date.now;
        try {
            Date.now = () => realNow() + 200;
            expect(c.get("https://a")).toBeNull();
        } finally {
            Date.now = realNow;
        }
    });

    test("エラー短期 TTL", () => {
        const c = new EmbedCache({ errorTtlMs: 100 });
        c.setError("https://a", "fetch-failed");
        expect(c.getError("https://a")).toBe("fetch-failed");
    });

    test("エラー TTL 切れ", () => {
        const c = new EmbedCache({ errorTtlMs: 100 });
        c.setError("https://a", "fetch-failed");
        const realNow = Date.now;
        try {
            Date.now = () => realNow() + 200;
            expect(c.getError("https://a")).toBeNull();
        } finally {
            Date.now = realNow;
        }
    });

    test("get returns null for missing key", () => {
        const c = new EmbedCache();
        expect(c.get("https://missing.example.com")).toBeNull();
    });

    test("getError returns null for missing key", () => {
        const c = new EmbedCache();
        expect(c.getError("https://missing.example.com")).toBeNull();
    });

    test("get swallows corrupt localStorage entry", () => {
        const c = new EmbedCache();
        // Write corrupt data directly to the key used by djb2Hash
        const KEY_PREFIX = "anytime-markdown:embed-cache:v1:";
        let h = 5381;
        const url = "https://corrupt.example.com";
        for (let i = 0; i < url.length; i++) h = (h * 33) ^ url.charCodeAt(i);
        localStorage.setItem(`${KEY_PREFIX}${(h >>> 0).toString(16)}`, "{bad-json");
        expect(c.get(url)).toBeNull();
    });

    test("set strips rawHtml from OgpData before persisting", () => {
        const c = new EmbedCache();
        const ogpWithRaw = { ...emptyOgp, rawHtml: "<html>" };
        c.set("https://raw.example.com", ogpWithRaw as Parameters<typeof c.set>[1]);
        const result = c.get("https://raw.example.com") as { rawHtml?: unknown };
        expect(result?.rawHtml).toBeNull();
    });

    test("set drops oversized payload silently", () => {
        const c = new EmbedCache();
        const hugeData = { ...emptyOgp, title: "x".repeat(150 * 1024) };
        expect(() => c.set("https://huge.example.com", hugeData)).not.toThrow();
        expect(c.get("https://huge.example.com")).toBeNull();
    });

    test("set swallows localStorage write errors", () => {
        const c = new EmbedCache();
        const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
            throw new Error("QuotaExceededError");
        });
        try {
            expect(() => c.set("https://q.example.com", emptyOgp)).not.toThrow();
        } finally {
            spy.mockRestore();
        }
    });

    test("setError swallows localStorage write errors", () => {
        const c = new EmbedCache();
        const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
            throw new Error("QuotaExceededError");
        });
        try {
            expect(() => c.setError("https://q.example.com", "err")).not.toThrow();
        } finally {
            spy.mockRestore();
        }
    });

    test("evicts oldest entries when MAX_ENTRIES (500) exceeded", () => {
        const c = new EmbedCache();
        // Fill up to MAX_ENTRIES
        for (let i = 0; i < 501; i++) {
            c.set(`https://example.com/item-${i}`, { ...emptyOgp, url: `https://example.com/item-${i}` });
        }
        // localStorage should not exceed MAX_ENTRIES entries
        const KEY_PREFIX = "anytime-markdown:embed-cache:v1:";
        const prefixedKeys = Object.keys(localStorage).filter((k) => k.startsWith(KEY_PREFIX));
        expect(prefixedKeys.length).toBeLessThanOrEqual(500);
    });

    test("getError swallows corrupt localStorage entry for error key", () => {
        const c = new EmbedCache();
        const KEY_PREFIX = "anytime-markdown:embed-cache:v1:";
        // Compute hash for the URL (same djb2 as source)
        const url = "https://err-corrupt.example.com";
        let h = 5381;
        for (let i = 0; i < url.length; i++) h = (h * 33) ^ url.charCodeAt(i);
        const hash = (h >>> 0).toString(16);
        localStorage.setItem(`${KEY_PREFIX}err:${hash}`, "{bad-json");
        expect(c.getError(url)).toBeNull();
    });

    test("evictIfNeeded skips entries where getItem returns null during scan", () => {
        const KEY_PREFIX = "anytime-markdown:embed-cache:v1:";
        const c = new EmbedCache();
        // Fill to just at eviction boundary
        for (let i = 0; i < 499; i++) {
            c.set(`https://example.com/skip-${i}`, emptyOgp);
        }
        // On next set, evictIfNeeded will scan. Intercept getItem so one call returns null.
        const origGetItem = Storage.prototype.getItem;
        let intercepted = false;
        Storage.prototype.getItem = function (key: string) {
            if (!intercepted && key.startsWith(KEY_PREFIX)) {
                intercepted = true;
                return null;
            }
            return origGetItem.call(this, key);
        };
        try {
            c.set("https://example.com/skip-trigger", emptyOgp);
        } finally {
            Storage.prototype.getItem = origGetItem;
        }
        expect(c.get("https://example.com/skip-trigger")).not.toBeNull();
    });

    test("evictIfNeeded removes corrupt entries encountered during scan", () => {
        const KEY_PREFIX = "anytime-markdown:embed-cache:v1:";
        // Add a corrupt entry that will be encountered during eviction scan
        localStorage.setItem(`${KEY_PREFIX}corrupt-scan`, "{bad-json");
        // Fill to trigger eviction
        const c = new EmbedCache();
        for (let i = 0; i < 500; i++) {
            c.set(`https://example.com/evict-${i}`, { ...emptyOgp, url: `https://example.com/evict-${i}` });
        }
        // Corrupt entry should have been cleaned up during eviction scan
        expect(localStorage.getItem(`${KEY_PREFIX}corrupt-scan`)).toBeNull();
    });
});

describe("EmbedCache without localStorage", () => {
    let origDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
        origDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
        Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true, writable: true });
    });

    afterEach(() => {
        if (origDescriptor) {
            Object.defineProperty(globalThis, "localStorage", origDescriptor);
        }
    });

    test("get returns null", () => {
        expect(new EmbedCache().get("https://a.example.com")).toBeNull();
    });

    test("set is a no-op", () => {
        expect(() => new EmbedCache().set("https://a.example.com", emptyOgp)).not.toThrow();
    });

    test("getError returns null", () => {
        expect(new EmbedCache().getError("https://a.example.com")).toBeNull();
    });

    test("setError is a no-op", () => {
        expect(() => new EmbedCache().setError("https://a.example.com", "err")).not.toThrow();
    });
});
