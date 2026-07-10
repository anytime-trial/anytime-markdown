/**
 * POST /api/drive/content（Drive への新規ファイル作成）のユニットテスト。
 *
 * getGoogleToken と fetch をモックし、認証・バリデーション・Drive API エラー透過を検証する。
 * next/server は global Request を要求するため node 環境で実行する（jsdom には無い）。
 *
 * @jest-environment node
 */

jest.mock("../lib/githubAuth", () => ({ getGoogleToken: jest.fn() }));

import { POST } from "../app/api/drive/content/route";
import { getGoogleToken } from "../lib/githubAuth";

const mockGetGoogleToken = getGoogleToken as jest.MockedFunction<typeof getGoogleToken>;

/** NextRequest の代わりに json() だけを持つ最小のスタブを渡す。 */
function request(body: unknown): Parameters<typeof POST>[0] {
  return { json: () => Promise.resolve(body) } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/drive/content", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("未認証なら 401", async () => {
    mockGetGoogleToken.mockResolvedValue(null);
    const res = await POST(request({ name: "a.md", content: "x" }));
    expect(res.status).toBe(401);
  });

  it("name が無ければ 400", async () => {
    mockGetGoogleToken.mockResolvedValue("token");
    const res = await POST(request({ content: "x" }));
    expect(res.status).toBe(400);
  });

  it("content が無ければ 400", async () => {
    mockGetGoogleToken.mockResolvedValue("token");
    const res = await POST(request({ name: "a.md" }));
    expect(res.status).toBe(400);
  });

  it("空文字の content は許容する（空ファイルの作成）", async () => {
    mockGetGoogleToken.mockResolvedValue("token");
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "f1", name: "a.md", headRevisionId: "r1" }),
      }),
    ) as unknown as typeof fetch;

    const res = await POST(request({ name: "a.md", content: "" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ fileId: "f1", name: "a.md", headRevisionId: "r1" });
  });

  it("作成成功で fileId / name / headRevisionId を返し、multipart で送る", async () => {
    mockGetGoogleToken.mockResolvedValue("token");
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "f1", name: "note.md", headRevisionId: "rev1" }),
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await POST(request({ name: "note.md", content: "# hi", parentId: "p1" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      fileId: "f1",
      name: "note.md",
      headRevisionId: "rev1",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("uploadType=multipart");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toContain("multipart/related");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(String(init.body)).toContain('"parents":["p1"]');
  });

  it("headRevisionId が無い応答では null を返す", async () => {
    mockGetGoogleToken.mockResolvedValue("token");
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "f1", name: "note.md" }) }),
    ) as unknown as typeof fetch;

    const res = await POST(request({ name: "note.md", content: "x" }));

    await expect(res.json()).resolves.toEqual({ fileId: "f1", name: "note.md", headRevisionId: null });
  });

  it("Drive API のエラーをステータスごと透過する", async () => {
    mockGetGoogleToken.mockResolvedValue("token");
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        url: "https://www.googleapis.com/upload/drive/v3/files",
        text: () => Promise.resolve('{"error":"forbidden"}'),
      }),
    ) as unknown as typeof fetch;

    const res = await POST(request({ name: "note.md", content: "x" }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: '{"error":"forbidden"}' });
  });
});
