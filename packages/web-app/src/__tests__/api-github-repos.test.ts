/**
 * /api/github/repos (GET) のユニットテスト
 *
 * GitHub 認証と fetchWithRetry をモックし、リポジトリ一覧取得を検証する。
 */

const mockGetGitHubToken = jest.fn();
const mockFetchWithRetry = jest.fn();

jest.mock("../lib/githubAuth", () => ({
  getGitHubToken: mockGetGitHubToken,
}));

jest.mock("../lib/fetchWithRetry", () => ({
  fetchWithRetry: mockFetchWithRetry,
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body: JSON.stringify(body),
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    })),
  },
}));

beforeEach(() => {
  mockGetGitHubToken.mockReset();
  mockFetchWithRetry.mockReset();
});

async function callGET() {
  const mod = await import("../app/api/github/repos/route");
  return mod.GET();
}

describe("GET /api/github/repos", () => {
  it("リポジトリ一覧を整形して返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { full_name: "user/repo1", private: false, default_branch: "main", extra: "ignored" },
        { full_name: "user/repo2", private: true, default_branch: "develop" },
      ]),
    });

    const res = (await callGET()) as unknown as { body: string; status: number; headers: Record<string, string> };
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
      { fullName: "user/repo2", private: true, defaultBranch: "develop" },
    ]);
    expect(res.headers["Cache-Control"]).toContain("max-age=300");
  });

  describe("スコープ不足の検知（旧 public_repo トークンの残留）", () => {
    /** `x-oauth-scopes` ヘッダを持つ GitHub 応答を作る。 */
    function respondWithScopes(scopes: string | null) {
      mockGetGitHubToken.mockResolvedValue("test-token");
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        headers: { get: (name: string) => (name.toLowerCase() === "x-oauth-scopes" ? scopes : null) },
        json: () => Promise.resolve([]),
      });
    }

    it("repo スコープが無ければ 403 と insufficient_scope を返す", async () => {
      respondWithScopes("public_repo, gist");
      const res = (await callGET()) as unknown as { body: string; status: number };
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body)).toEqual({ error: "insufficient_scope" });
    });

    it("repo スコープがあれば通常どおり 200 を返す", async () => {
      respondWithScopes("repo, gist");
      const res = (await callGET()) as unknown as { status: number };
      expect(res.status).toBe(200);
    });

    it("スコープヘッダが無い応答は判定せず通す（後方互換）", async () => {
      respondWithScopes(null);
      const res = (await callGET()) as unknown as { status: number };
      expect(res.status).toBe(200);
    });
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);

    const res = (await callGET()) as unknown as { body: string; status: number };
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Not authenticated" });
  });

  it("GitHub API エラーの場合はそのステータスを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({ ok: false, status: 403 });

    const res = (await callGET()) as unknown as { body: string; status: number };
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: "GitHub API error" });
  });
});

export {};
