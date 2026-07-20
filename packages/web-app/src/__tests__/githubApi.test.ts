/**
 * src/lib/githubApi.ts のユニットテスト
 *
 * global.fetch をモックし、fetchFileContent を検証する。
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { fetchFileContent } from "../lib/githubApi";

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── fetchFileContent ────────────────────────────────────────────────────────

describe("fetchFileContent", () => {
  it("ファイル内容を返す", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: "Hello" }),
    });
    const result = await fetchFileContent("user/repo", "README.md", "main");
    expect(result).toBe("Hello");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/github/content?"),
    );
  });

  it("レスポンスが ok でない場合はエラーを投げる（401 を空ファイルとして握りつぶさない）", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchFileContent("user/repo", "missing.md", "main")).rejects.toThrow(/401/);
  });

  it("404 でもエラーを投げる", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchFileContent("user/repo", "missing.md", "main")).rejects.toThrow(/404/);
  });

  it("content が undefined の場合は空文字を返す", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result = await fetchFileContent("user/repo", "empty.md", "main");
    expect(result).toBe("");
  });
});
