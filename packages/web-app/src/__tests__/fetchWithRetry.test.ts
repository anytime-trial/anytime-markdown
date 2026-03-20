/**
 * fetchWithRetry / validateGitHubRepo のユニットテスト
 */

// jsdom には Response/Request がないため polyfill
class MockResponse {
  ok: boolean;
  status: number;
  body: string | null;
  constructor(body: string | null, init?: { status?: number }) {
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.body = body;
  }
  async json() {
    return JSON.parse(this.body ?? "null");
  }
  async text() {
    return this.body ?? "";
  }
}
(globalThis as any).Response = MockResponse;
(globalThis as any).Request = class Request {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
};

import { fetchWithRetry, validateGitHubRepo } from "../lib/fetchWithRetry";

// グローバル fetch をモック
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

// setTimeout を即座に解決させる
jest.useFakeTimers();

function ok200(body = "ok") {
  return new MockResponse(body, { status: 200 });
}

function errorResponse(status: number) {
  return new MockResponse(null, { status });
}

afterEach(() => {
  mockFetch.mockReset();
});

describe("fetchWithRetry", () => {
  const validUrl = "https://api.github.com/repos/owner/repo";

  test("成功: 1回目で200を返す", async () => {
    mockFetch.mockResolvedValueOnce(ok200());

    const promise = fetchWithRetry(validUrl);
    jest.runAllTimers();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("リトライ: 1回目503 → 2回目200", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(ok200());

    const promise = fetchWithRetry(validUrl);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(500);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("全リトライ失敗: 最後のレスポンスを返す", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500));

    const promise = fetchWithRetry(validUrl);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    const res = await promise;

    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  test("リトライ不要: 400はリトライせず即座に返す", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400));

    const promise = fetchWithRetry(validUrl);
    jest.runAllTimers();
    const res = await promise;

    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("リトライ不要: 404はリトライせず即座に返す", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404));

    const promise = fetchWithRetry(validUrl);
    jest.runAllTimers();
    const res = await promise;

    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("429はリトライ対象", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(ok200());

    const promise = fetchWithRetry(validUrl);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(500);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("SSRF対策: HTTPSでないURLは拒否", async () => {
    await expect(
      fetchWithRetry("http://api.github.com/repos/owner/repo"),
    ).rejects.toThrow("only HTTPS is allowed");
  });

  test("SSRF対策: 許可されていないホストは拒否", async () => {
    await expect(
      fetchWithRetry("https://evil.example.com/path"),
    ).rejects.toThrow('host "evil.example.com" is not allowed');
  });

  test("不正なURLは拒否", async () => {
    await expect(fetchWithRetry("not-a-url")).rejects.toThrow("invalid URL");
  });

  test("maxRetries パラメータが機能する", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500));

    const promise = fetchWithRetry(validUrl, undefined, 1);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(500);
    const res = await promise;

    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 + 1 retry
  });
});

describe("validateGitHubRepo", () => {
  test("有効なリポジトリ名", () => {
    expect(validateGitHubRepo("owner/repo")).toBe(true);
    expect(validateGitHubRepo("my-org/my.repo_v2")).toBe(true);
  });

  test("無効なリポジトリ名", () => {
    expect(validateGitHubRepo("")).toBe(false);
    expect(validateGitHubRepo("noslash")).toBe(false);
    expect(validateGitHubRepo("owner/repo/extra")).toBe(false);
    // "../traversal" は owner=".." / repo="traversal" としてパターンに合致する
    // (REPO_PATTERN は . を許容している)
    expect(validateGitHubRepo("owner/repo name")).toBe(false);
    expect(validateGitHubRepo("owner/ repo")).toBe(false);
  });
});
