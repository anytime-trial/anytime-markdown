/**
 * explorer/helpers.ts の純粋関数テスト
 *
 * fetch を使う非同期関数もモックして基本動作を検証する。
 */

// jsdom には Response がないため polyfill
class MockResponse {
  ok: boolean;
  status: number;
  _body: string | null;
  constructor(body: string | null, init?: { status?: number }) {
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this._body = body;
  }
  async json() {
    return JSON.parse(this._body ?? "null");
  }
  async text() {
    return this._body ?? "";
  }
}
(globalThis as any).Response = MockResponse;

import {
  formatCommitDate,
  truncateMessage,
  fetchDirEntries,
  fetchCommits,
  fetchBranches,
  deleteFile,
  createFile,
  renameFile,
} from "../components/explorer/helpers";

// グローバル fetch をモック
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

afterEach(() => {
  mockFetch.mockReset();
});

// ── 純粋関数 ──

describe("formatCommitDate", () => {
  test("ISO文字列を MM/DD HH:mm 形式にフォーマットする", () => {
    const d = new Date(2026, 0, 5, 14, 30); // ローカル時間
    const result = formatCommitDate(d.toISOString());
    expect(result).toBe("01/05 14:30");
  });

  test("月・日・時・分がゼロパディングされる", () => {
    const d = new Date(2026, 0, 1, 3, 5);
    const result = formatCommitDate(d.toISOString());
    expect(result).toBe("01/01 03:05");
  });
});

describe("truncateMessage", () => {
  test("短いメッセージはそのまま返す", () => {
    expect(truncateMessage("short msg")).toBe("short msg");
  });

  test("長いメッセージは切り詰めて ... を付加する", () => {
    const long = "a".repeat(50);
    const result = truncateMessage(long, 40);
    expect(result).toBe("a".repeat(40) + "...");
  });

  test("改行がある場合は最初の行のみ使用する", () => {
    expect(truncateMessage("first line\nsecond line")).toBe("first line");
  });

  test("デフォルトの max は 40", () => {
    const exactly40 = "b".repeat(40);
    expect(truncateMessage(exactly40)).toBe(exactly40);

    const over40 = "c".repeat(41);
    expect(truncateMessage(over40)).toBe("c".repeat(40) + "...");
  });
});

// ── fetch を使う関数 ──

describe("fetchDirEntries", () => {
  test("正常: ディレクトリ・MDファイルをソートして返す", async () => {
    const apiData = [
      { path: "docs/b.md", type: "file", name: "b.md" },
      { path: "docs/sub", type: "dir", name: "sub" },
      { path: "docs/a.md", type: "file", name: "a.md" },
      { path: "docs/image.png", type: "file", name: "image.png" },
    ];
    mockFetch.mockResolvedValueOnce(
      new MockResponse(JSON.stringify(apiData), { status: 200 }),
    );

    const entries = await fetchDirEntries("owner/repo", "main", "docs");

    // image.png は除外、tree が先、blob はアルファベット順
    expect(entries).toEqual([
      { path: "docs/sub", type: "tree", name: "sub" },
      { path: "docs/a.md", type: "blob", name: "a.md" },
      { path: "docs/b.md", type: "blob", name: "b.md" },
    ]);
  });

  test(".markdown 拡張子も含まれる", async () => {
    const apiData = [
      { path: "docs/note.markdown", type: "file", name: "note.markdown" },
    ];
    mockFetch.mockResolvedValueOnce(
      new MockResponse(JSON.stringify(apiData), { status: 200 }),
    );

    const entries = await fetchDirEntries("owner/repo", "main", "docs");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("note.markdown");
  });

  test("APIエラー時は空配列を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 500 }));
    const entries = await fetchDirEntries("owner/repo", "main", "docs");
    expect(entries).toEqual([]);
  });
});

describe("fetchCommits", () => {
  test("正常: commits と stale を返す", async () => {
    const apiData = {
      commits: [{ sha: "abc", message: "init", author: "a", date: "2026-01-01" }],
      stale: true,
    };
    mockFetch.mockResolvedValueOnce(
      new MockResponse(JSON.stringify(apiData), { status: 200 }),
    );

    const result = await fetchCommits("owner/repo", "file.md", "main");
    expect(result.commits).toHaveLength(1);
    expect(result.stale).toBe(true);
  });

  test("配列レスポンスの後方互換", async () => {
    const apiData = [{ sha: "abc", message: "init", author: "a", date: "2026-01-01" }];
    mockFetch.mockResolvedValueOnce(
      new MockResponse(JSON.stringify(apiData), { status: 200 }),
    );

    const result = await fetchCommits("owner/repo", "file.md");
    expect(result.commits).toHaveLength(1);
    expect(result.stale).toBe(false);
  });

  test("APIエラー時は空結果を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 404 }));
    const result = await fetchCommits("owner/repo", "file.md");
    expect(result).toEqual({ commits: [], stale: false });
  });
});

describe("fetchBranches", () => {
  test("正常: ブランチ名配列を返す", async () => {
    mockFetch.mockResolvedValueOnce(
      new MockResponse(JSON.stringify(["main", "develop"]), { status: 200 }),
    );
    const branches = await fetchBranches("owner/repo");
    expect(branches).toEqual(["main", "develop"]);
  });

  test("APIエラー時は空配列を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 500 }));
    const branches = await fetchBranches("owner/repo");
    expect(branches).toEqual([]);
  });
});

describe("deleteFile", () => {
  test("成功時は true を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 200 }));
    expect(await deleteFile("owner/repo", "file.md", "main")).toBe(true);
  });

  test("失敗時は false を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 500 }));
    expect(await deleteFile("owner/repo", "file.md", "main")).toBe(false);
  });
});

describe("createFile", () => {
  test("成功時はパスを含むオブジェクトを返す", async () => {
    mockFetch.mockResolvedValueOnce(
      new MockResponse(JSON.stringify({ path: "new.md" }), { status: 200 }),
    );
    const result = await createFile("owner/repo", "new.md", "main");
    expect(result).toEqual({ path: "new.md" });
  });

  test("失敗時は null を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 422 }));
    const result = await createFile("owner/repo", "new.md", "main");
    expect(result).toBeNull();
  });
});

describe("renameFile", () => {
  test("成功時は true を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 200 }));
    expect(await renameFile("owner/repo", "old.md", "new.md", "main")).toBe(true);
  });

  test("失敗時は false を返す", async () => {
    mockFetch.mockResolvedValueOnce(new MockResponse(null, { status: 500 }));
    expect(await renameFile("owner/repo", "old.md", "new.md", "main")).toBe(false);
  });
});
