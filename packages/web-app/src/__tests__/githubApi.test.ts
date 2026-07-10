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

  it("レスポンスが ok でない場合は空文字を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await fetchFileContent("user/repo", "missing.md", "main");
    expect(result).toBe("");
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
