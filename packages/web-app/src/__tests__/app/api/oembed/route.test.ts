/**
 * @jest-environment node
 */
import { GET } from "../../../../app/api/oembed/route";

describe("/api/oembed", () => {
    test("missing url", async () => {
        const req = new Request("http://localhost/api/oembed");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    test("ホスト外 URL 拒否", async () => {
        const req = new Request("http://localhost/api/oembed?url=https://example.com/post");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    test("非 http スキーム拒否", async () => {
        const req = new Request("http://localhost/api/oembed?url=ftp://twitter.com/u/status/1");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });
});
