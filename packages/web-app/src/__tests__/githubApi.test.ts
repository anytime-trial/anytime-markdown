/**
 * src/lib/githubApi.ts のユニットテスト
 *
 * global.fetch をモックし、各 API ヘルパー関数を検証する。
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  fetchFileContent,
  fetchDirEntries,
  fetchCommits,
  fetchBranches,
  deleteFile,
  createOrUpdateFile,
  renameFile,
  listAllFiles,
} from "../lib/githubApi";

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

// ─── fetchDirEntries ─────────────────────────────────────────────────────────

describe("fetchDirEntries", () => {
  it("ディレクトリエントリを返す", async () => {
    const entries = [
      { name: "file.md", path: "file.md", type: "file" },
      { name: "docs", path: "docs", type: "dir" },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(entries),
    });
    const result = await fetchDirEntries("user/repo", "main", "");
    expect(result).toEqual(entries);
  });

  it("レスポンスが ok でない場合は空配列を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await fetchDirEntries("user/repo", "main", "");
    expect(result).toEqual([]);
  });
});

// ─── fetchCommits ────────────────────────────────────────────────────────────

describe("fetchCommits", () => {
  it("コミット履歴を返す", async () => {
    const data = {
      commits: [{ sha: "abc", message: "init", author: "user", date: "2025-01-01" }],
      stale: false,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });
    const result = await fetchCommits("user/repo", "file.md", "main");
    expect(result).toEqual(data);
  });

  it("レスポンスが ok でない場合は空を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await fetchCommits("user/repo", "file.md", "main");
    expect(result).toEqual({ commits: [], stale: false });
  });
});

// ─── fetchBranches ───────────────────────────────────────────────────────────

describe("fetchBranches", () => {
  it("ブランチ一覧を返す", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(["main", "develop"]),
    });
    const result = await fetchBranches("user/repo");
    expect(result).toEqual(["main", "develop"]);
  });

  it("レスポンスが ok でない場合は空配列を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await fetchBranches("user/repo");
    expect(result).toEqual([]);
  });
});

// ─── deleteFile ──────────────────────────────────────────────────────────────

describe("deleteFile", () => {
  it("成功時に true を返す", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const result = await deleteFile("user/repo", "file.md", "delete msg", "main");
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("/api/github/content", expect.objectContaining({
      method: "DELETE",
    }));
  });

  it("失敗時に false を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await deleteFile("user/repo", "file.md", "msg", "main");
    expect(result).toBe(false);
  });
});

// ─── createOrUpdateFile ──────────────────────────────────────────────────────

describe("createOrUpdateFile", () => {
  it("成功時にデータを返す", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ path: "new.md", sha: "abc" }),
    });
    const result = await createOrUpdateFile("user/repo", "new.md", "content", "msg", "main");
    expect(result.ok).toBe(true);
    expect(result.path).toBe("new.md");
  });

  it("失敗時に ok: false を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await createOrUpdateFile("user/repo", "new.md", "content", "msg", "main");
    expect(result.ok).toBe(false);
  });
});

// ─── renameFile ──────────────────────────────────────────────────────────────

describe("renameFile", () => {
  it("成功時に true を返す", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const result = await renameFile("user/repo", "old.md", "new.md", "main");
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("/api/github/content", expect.objectContaining({
      method: "PATCH",
    }));
  });

  it("失敗時に false を返す", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await renameFile("user/repo", "old.md", "new.md", "main");
    expect(result).toBe(false);
  });
});

// ─── listAllFiles ────────────────────────────────────────────────────────────

describe("listAllFiles", () => {
  it("再帰的にファイルパスを収集する", async () => {
    // ルート: ファイル1つ + サブディレクトリ1つ
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "root.md", path: "root.md", type: "file" },
          { name: "sub", path: "sub", type: "dir" },
        ]),
    });
    // サブディレクトリ: ファイル1つ
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "child.md", path: "sub/child.md", type: "file" },
        ]),
    });

    const result = await listAllFiles("user/repo", "main", "");
    expect(result).toEqual(["root.md", "sub/child.md"]);
  });

  it("空ディレクトリの場合は空配列を返す", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    const result = await listAllFiles("user/repo", "main", "empty");
    expect(result).toEqual([]);
  });
});
