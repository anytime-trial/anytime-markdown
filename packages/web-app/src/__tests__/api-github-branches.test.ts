/**
 * /api/github/branches (GET) のユニットテスト
 *
 * GitHub 認証と fetchWithRetry をモックし、ブランチ一覧取得を検証する。
 */

const mockGetGitHubToken = jest.fn();
const mockFetchWithRetry = jest.fn();
const mockValidateGitHubRepo = jest.fn();

jest.mock("../lib/githubAuth", () => ({
  getGitHubToken: mockGetGitHubToken,
}));

jest.mock("../lib/fetchWithRetry", () => ({
  fetchWithRetry: mockFetchWithRetry,
  validateGitHubRepo: mockValidateGitHubRepo,
}));

jest.mock("next/server", () => {
  class MockNextRequest {
    nextUrl: URL;
    constructor(url: string) {
      this.nextUrl = new URL(url);
    }
  }
  return {
    NextResponse: {
      json: jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
        body: JSON.stringify(body),
        status: init?.status ?? 200,
        headers: init?.headers ?? {},
      })),
    },
    NextRequest: MockNextRequest,
  };
});

beforeEach(() => {
  mockGetGitHubToken.mockReset();
  mockFetchWithRetry.mockReset();
  mockValidateGitHubRepo.mockReset();
  mockValidateGitHubRepo.mockReturnValue(true);
});

function createRequest(params?: Record<string, string>) {
  const { NextRequest } = jest.requireMock("next/server");
  const url = new URL("http://localhost:3000/api/github/branches");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
}

async function callGET(request: unknown) {
  const mod = await import("../app/api/github/branches/route");
  return mod.GET(request as import("next/server").NextRequest);
}

describe("GET /api/github/branches", () => {
  it("ブランチ名の一覧を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { name: "main" },
        { name: "develop" },
        { name: "feature/test" },
      ]),
    });

    const req = createRequest({ repo: "user/repo" });
    const res = (await callGET(req)) as unknown as { body: string; status: number; headers: Record<string, string> };
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual(["main", "develop", "feature/test"]);
    expect(res.headers["Cache-Control"]).toContain("max-age=300");
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);

    const req = createRequest({ repo: "user/repo" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Not authenticated" });
  });

  it("repo パラメータが未指定の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");

    const req = createRequest();
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid or missing repo param" });
  });

  it("無効な repo 名の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockValidateGitHubRepo.mockReturnValue(false);

    const req = createRequest({ repo: "invalid" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid or missing repo param" });
  });

  it("GitHub API エラーの場合はそのステータスを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({ ok: false, status: 404 });

    const req = createRequest({ repo: "user/repo" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "GitHub API error" });
  });
});

export {};
