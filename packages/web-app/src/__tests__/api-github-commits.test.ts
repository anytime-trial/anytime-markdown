/**
 * /api/github/commits (GET) のユニットテスト
 *
 * GitHub 認証と fetchWithRetry をモックし、コミット履歴取得と stale 検出を検証する。
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

function createRequest(params: Record<string, string>) {
  const { NextRequest } = jest.requireMock("next/server");
  const url = new URL("http://localhost:3000/api/github/commits");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

async function callGET(request: unknown) {
  const mod = await import("../app/api/github/commits/route");
  return mod.GET(request as import("next/server").NextRequest);
}

const sampleCommits = [
  { sha: "abc123", commit: { message: "feat: add feature", author: { name: "Alice", date: "2026-03-01T00:00:00Z" } } },
  { sha: "def456", commit: { message: "fix: bug fix", author: { name: "Bob", date: "2026-02-28T00:00:00Z" } } },
];

describe("GET /api/github/commits", () => {
  it("コミット一覧を整形して返す（branch 未指定）", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleCommits),
    });

    const req = createRequest({ repo: "user/repo", path: "README.md" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.commits).toEqual([
      { sha: "abc123", message: "feat: add feature", author: "Alice", date: "2026-03-01T00:00:00Z" },
      { sha: "def456", message: "fix: bug fix", author: "Bob", date: "2026-02-28T00:00:00Z" },
    ]);
    expect(body.stale).toBe(false);
  });

  it("branch 指定時に stale=false を返す（blob SHA が一致）", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    // コミット一覧
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleCommits),
    });
    // getFileBlobSha: head blob
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "blob-sha-1" }),
    });
    // getFileBlobSha: first commit blob
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "blob-sha-1" }),
    });

    const req = createRequest({ repo: "user/repo", path: "README.md", branch: "main" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    const body = JSON.parse(res.body);
    expect(body.stale).toBe(false);
  });

  it("branch 指定時に stale=true を返す（blob SHA が不一致）", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleCommits),
    });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "blob-sha-new" }),
    });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "blob-sha-old" }),
    });

    const req = createRequest({ repo: "user/repo", path: "README.md", branch: "main" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    const body = JSON.parse(res.body);
    expect(body.stale).toBe(true);
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);

    const req = createRequest({ repo: "user/repo", path: "README.md" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Not authenticated" });
  });

  it("repo または path が未指定の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");

    const req = createRequest({ repo: "user/repo" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid or missing params" });
  });

  it("無効な repo 名の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockValidateGitHubRepo.mockReturnValue(false);

    const req = createRequest({ repo: "invalid", path: "README.md" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid or missing params" });
  });

  it("GitHub API エラーの場合はそのステータスを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({ ok: false, status: 500 });

    const req = createRequest({ repo: "user/repo", path: "README.md" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "GitHub API error" });
  });
});

export {};
