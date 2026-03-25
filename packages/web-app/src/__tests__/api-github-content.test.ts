/**
 * /api/github/content (GET / PUT / DELETE / PATCH) のユニットテスト
 *
 * GitHub 認証と fetchWithRetry をモックし、コンテンツ CRUD 操作を検証する。
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
    private _body: unknown;
    constructor(url: string, init?: { method?: string; body?: string }) {
      this.nextUrl = new URL(url);
      this._body = init?.body ? JSON.parse(init.body) : undefined;
    }
    async json() {
      return this._body;
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
  const url = new URL("http://localhost:3000/api/github/content");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
}

function createBodyRequest(body: Record<string, unknown>) {
  const { NextRequest } = jest.requireMock("next/server");
  const url = "http://localhost:3000/api/github/content";
  return new NextRequest(url, { body: JSON.stringify(body) });
}

type MockRes = { body: string; status: number; headers: Record<string, string> };

async function callGET(request: unknown) {
  const mod = await import("../app/api/github/content/route");
  return mod.GET(request as import("next/server").NextRequest);
}

async function callPUT(request: unknown) {
  const mod = await import("../app/api/github/content/route");
  return mod.PUT(request as import("next/server").NextRequest);
}

async function callDELETE(request: unknown) {
  const mod = await import("../app/api/github/content/route");
  return mod.DELETE(request as import("next/server").NextRequest);
}

async function callPATCH(request: unknown) {
  const mod = await import("../app/api/github/content/route");
  return mod.PATCH(request as import("next/server").NextRequest);
}

// ─── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/github/content", () => {
  it("ディレクトリ一覧を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "README.md", path: "README.md", type: "file" },
          { name: "docs", path: "docs", type: "dir" },
        ]),
    });

    const req = createRequest({ repo: "user/repo", path: "", ref: "main" });
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ name: "README.md", path: "README.md", type: "file" });
  });

  it("単一ファイルの内容をデコードして返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    const encoded = Buffer.from("Hello World").toString("base64");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: encoded }),
    });

    const req = createRequest({ repo: "user/repo", path: "README.md", ref: "main" });
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ content: "Hello World" });
  });

  it("content が null の場合は空文字を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: null }),
    });

    const req = createRequest({ repo: "user/repo", path: "empty.md", ref: "main" });
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ content: "" });
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const req = createRequest({ repo: "user/repo", path: "", ref: "main" });
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(401);
  });

  it("パラメータ不足の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    const req = createRequest({ repo: "user/repo" }); // path, ref 不足
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
  });

  it("無効な repo 名の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockValidateGitHubRepo.mockReturnValue(false);
    const req = createRequest({ repo: "invalid", path: "", ref: "main" });
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
  });

  it("GitHub API エラーの場合はそのステータスを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({ ok: false, status: 404 });
    const req = createRequest({ repo: "user/repo", path: "missing.md", ref: "main" });
    const res = (await callGET(req)) as unknown as MockRes;
    expect(res.status).toBe(404);
  });

  it("パス内の特殊文字をエンコードする", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: null }),
    });

    const req = createRequest({ repo: "user/repo", path: "docs/日本語.md", ref: "main" });
    await callGET(req);
    const url = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(url).toContain("%E6%97%A5%E6%9C%AC%E8%AA%9E.md");
  });
});

// ─── PUT ─────────────────────────────────────────────────────────────────────

describe("PUT /api/github/content", () => {
  it("ファイルを作成する", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    // sha 自動取得: 404 = 新規ファイル
    mockFetchWithRetry.mockResolvedValueOnce({ ok: false, status: 404 });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: { path: "new.md", sha: "abc123" },
          commit: { sha: "c1", message: "Create new.md", author: { name: "user", date: "2025-01-01" } },
        }),
    });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "new.md",
      content: "Hello",
      branch: "main",
    });
    const res = (await callPUT(req)) as unknown as MockRes;
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.path).toBe("new.md");
    expect(body.sha).toBe("abc123");
    expect(body.commit.sha).toBe("c1");
  });

  it("既存ファイル更新時に sha を自動取得する", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    // sha 自動取得: 200 = 既存ファイル
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "existing-sha" }),
    });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: { path: "existing.md", sha: "new-sha" },
          commit: { sha: "c2", message: "Update existing.md", author: { name: "user", date: "2025-01-01" } },
        }),
    });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "existing.md",
      content: "Updated",
      branch: "main",
    });
    const res = (await callPUT(req)) as unknown as MockRes;
    expect(res.status).toBe(200);

    // PUT リクエストに sha が含まれることを確認
    const putCall = mockFetchWithRetry.mock.calls[1];
    const putBody = JSON.parse(putCall[1].body);
    expect(putBody.sha).toBe("existing-sha");
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const req = createBodyRequest({ repo: "user/repo", path: "test.md" });
    const res = (await callPUT(req)) as unknown as MockRes;
    expect(res.status).toBe(401);
  });

  it("パラメータ不足の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    const req = createBodyRequest({ repo: "user/repo" }); // path 不足
    const res = (await callPUT(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
  });

  it("GitHub API エラーの場合はエラーメッセージを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({ ok: false, status: 404 }); // sha 取得
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: "Validation Failed" }),
    });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "test.md",
      content: "x",
      branch: "main",
    });
    const res = (await callPUT(req)) as unknown as MockRes;
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body)).toEqual({ error: "Validation Failed" });
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE /api/github/content", () => {
  it("ファイルを削除する", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    // sha 取得
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "file-sha" }),
    });
    // DELETE
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "delete-me.md",
      branch: "main",
    });
    const res = (await callDELETE(req)) as unknown as MockRes;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const req = createBodyRequest({ repo: "user/repo", path: "x.md" });
    const res = (await callDELETE(req)) as unknown as MockRes;
    expect(res.status).toBe(401);
  });

  it("パラメータ不足の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    const req = createBodyRequest({ repo: "user/repo" });
    const res = (await callDELETE(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
  });

  it("ファイルが見つからない場合はエラーを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({ ok: false, status: 404 });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "missing.md",
      branch: "main",
    });
    const res = (await callDELETE(req)) as unknown as MockRes;
    expect(res.status).toBe(404);
  });

  it("sha が取得できない場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}), // sha なし
    });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "no-sha.md",
      branch: "main",
    });
    const res = (await callDELETE(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Cannot get file SHA" });
  });

  it("DELETE API エラーの場合はエラーを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: "file-sha" }),
    });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: "Internal error" }),
    });

    const req = createBodyRequest({
      repo: "user/repo",
      path: "error.md",
      branch: "main",
    });
    const res = (await callDELETE(req)) as unknown as MockRes;
    expect(res.status).toBe(500);
  });
});

// ─── PATCH (rename) ─────────────────────────────────────────────────────────

describe("PATCH /api/github/content", () => {
  it("ファイルをリネームする", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    // GET old file
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: "SGVsbG8=", sha: "old-sha" }),
    });
    // PUT new + DELETE old (parallel)
    mockFetchWithRetry.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    mockFetchWithRetry.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const req = createBodyRequest({
      repo: "user/repo",
      oldPath: "old.md",
      newPath: "new.md",
      branch: "main",
    });
    const res = (await callPATCH(req)) as unknown as MockRes;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ renamed: true });
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const req = createBodyRequest({ repo: "user/repo", oldPath: "a.md", newPath: "b.md" });
    const res = (await callPATCH(req)) as unknown as MockRes;
    expect(res.status).toBe(401);
  });

  it("パラメータ不足の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    const req = createBodyRequest({ repo: "user/repo", oldPath: "a.md" });
    const res = (await callPATCH(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
  });

  it("元ファイルが見つからない場合はエラーを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({ ok: false, status: 404 });

    const req = createBodyRequest({
      repo: "user/repo",
      oldPath: "missing.md",
      newPath: "new.md",
      branch: "main",
    });
    const res = (await callPATCH(req)) as unknown as MockRes;
    expect(res.status).toBe(404);
  });

  it("ファイルの content/sha が不足の場合は 400 を返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: null, content: null }),
    });

    const req = createBodyRequest({
      repo: "user/repo",
      oldPath: "a.md",
      newPath: "b.md",
      branch: "main",
    });
    const res = (await callPATCH(req)) as unknown as MockRes;
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Cannot read file" });
  });

  it("PUT が失敗した場合はエラーを返す", async () => {
    mockGetGitHubToken.mockResolvedValue("test-token");
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: "SGVsbG8=", sha: "sha1" }),
    });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: "Put failed" }),
    });
    mockFetchWithRetry.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const req = createBodyRequest({
      repo: "user/repo",
      oldPath: "a.md",
      newPath: "b.md",
      branch: "main",
    });
    const res = (await callPATCH(req)) as unknown as MockRes;
    expect(res.status).toBe(422);
  });
});

export {};
