import { EmbedCache } from "../../utils/embedCache";

describe("EmbedCache", () => {
    beforeEach(() => localStorage.clear());

    const emptyOgp = {
        url: "https://a",
        title: "t",
        description: null,
        image: null,
        siteName: null,
        favicon: null,
    };

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
});
