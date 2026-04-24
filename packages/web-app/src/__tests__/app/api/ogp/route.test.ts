/**
 * @jest-environment node
 */
import { GET } from "../../../../app/api/ogp/route";

describe("/api/ogp", () => {
    test("missing url", async () => {
        const req = new Request("http://localhost/api/ogp");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    test("SSRF: プライベート IP 拒否", async () => {
        const req = new Request("http://localhost/api/ogp?url=http://127.0.0.1/");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    test("非 http スキーム拒否", async () => {
        const req = new Request("http://localhost/api/ogp?url=ftp://example.com/");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });
});
