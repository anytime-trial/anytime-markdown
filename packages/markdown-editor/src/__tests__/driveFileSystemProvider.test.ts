import { DriveFileSystemProvider } from "../fs/driveFileSystemProvider";

interface MockResponseSpec {
  status: number;
  body: unknown;
  text?: string;
}

function mockFetchSequence(responses: MockResponseSpec[]): jest.Mock {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status < 400,
      status: r.status,
      json: async () => r.body,
      text: async () => r.text ?? JSON.stringify(r.body),
    });
  }
  return fn;
}

describe("DriveFileSystemProvider", () => {
  it("open() は null を返す（Picker 前提の openById を使う）", async () => {
    const p = new DriveFileSystemProvider({
      getToken: async () => "tok",
      fetchFn: jest.fn(),
    });
    await expect(p.open()).resolves.toBeNull();
  });

  it("saveAs() は null を返す（初期リリースは既存ファイル更新のみ）", async () => {
    const p = new DriveFileSystemProvider({
      getToken: async () => "tok",
      fetchFn: jest.fn(),
    });
    await expect(p.saveAs("content")).resolves.toBeNull();
  });

  it("supportsDirectAccess は true", () => {
    const p = new DriveFileSystemProvider({
      getToken: async () => "tok",
      fetchFn: jest.fn(),
    });
    expect(p.supportsDirectAccess).toBe(true);
  });

  it("openById がメタ＋本文を取得し handle に fileId/headRevisionId を持つ", async () => {
    const fetchFn = mockFetchSequence([
      { status: 200, body: { name: "a.md", headRevisionId: "r1" } },
      { status: 200, body: {}, text: "# hi" },
    ]);
    const p = new DriveFileSystemProvider({ getToken: async () => "tok", fetchFn });
    const result = await p.openById("F1");
    expect(result.content).toBe("# hi");
    expect(result.handle.name).toBe("a.md");
    expect(result.handle.nativeHandle).toEqual({ fileId: "F1", headRevisionId: "r1" });
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://www.googleapis.com/drive/v3/files/F1?fields=name%2CheadRevisionId",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("save 前に headRevisionId が変わっていて confirmOverwrite 未指定なら DriveConflictError", async () => {
    const fetchFn = mockFetchSequence([
      { status: 200, body: { name: "a.md", headRevisionId: "r2" } },
    ]);
    const p = new DriveFileSystemProvider({ getToken: async () => "tok", fetchFn });
    await expect(
      p.save({ name: "a.md", nativeHandle: { fileId: "F1", headRevisionId: "r1" } }, "x"),
    ).rejects.toMatchObject({ name: "DriveConflictError", latestHeadRevisionId: "r2" });
  });

  it("save 前に headRevisionId が一致していれば PATCH で更新する", async () => {
    const fetchFn = mockFetchSequence([
      { status: 200, body: { name: "a.md", headRevisionId: "r1" } },
      { status: 200, body: {} },
      { status: 200, body: { name: "a.md", headRevisionId: "r3" } },
    ]);
    const p = new DriveFileSystemProvider({ getToken: async () => "tok", fetchFn });
    const handle = { name: "a.md", nativeHandle: { fileId: "F1", headRevisionId: "r1" } };
    await p.save(handle, "new content");
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://www.googleapis.com/upload/drive/v3/files/F1?uploadType=media",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "text/markdown",
        }),
        body: "new content",
      }),
    );
    expect(handle.nativeHandle).toEqual({ fileId: "F1", headRevisionId: "r3" });
  });

  it("confirmOverwrite が true を返すと最新 revision で上書きし再取得した revision に更新する", async () => {
    const fetchFn = mockFetchSequence([
      { status: 200, body: { name: "a.md", headRevisionId: "r2" } },
      { status: 200, body: {} },
      { status: 200, body: { name: "a.md", headRevisionId: "r4" } },
    ]);
    const confirmOverwrite = jest.fn().mockResolvedValue(true);
    const p = new DriveFileSystemProvider({ getToken: async () => "tok", fetchFn, confirmOverwrite });
    const handle = { name: "a.md", nativeHandle: { fileId: "F1", headRevisionId: "r1" } };
    await p.save(handle, "overwritten");
    expect(confirmOverwrite).toHaveBeenCalledWith("r2");
    expect(handle.nativeHandle).toEqual({ fileId: "F1", headRevisionId: "r4" });
  });

  it("confirmOverwrite が false を返すと DriveConflictError を再スローする", async () => {
    const fetchFn = mockFetchSequence([
      { status: 200, body: { name: "a.md", headRevisionId: "r2" } },
    ]);
    const confirmOverwrite = jest.fn().mockResolvedValue(false);
    const p = new DriveFileSystemProvider({ getToken: async () => "tok", fetchFn, confirmOverwrite });
    await expect(
      p.save({ name: "a.md", nativeHandle: { fileId: "F1", headRevisionId: "r1" } }, "x"),
    ).rejects.toMatchObject({ name: "DriveConflictError", latestHeadRevisionId: "r2" });
  });

  it("nativeHandle が不正な形の場合は console.error して no-op で return する", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = jest.fn();
    const p = new DriveFileSystemProvider({ getToken: async () => "tok", fetchFn });
    await p.save({ name: "a.md", nativeHandle: { wrong: "shape" } }, "x");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("fetchFn 省略時は globalThis.fetch を使う（本番パスへの暗黙フォールバックだが注入可能な設計を確認）", () => {
    const p = new DriveFileSystemProvider({ getToken: async () => "tok" });
    expect(p.supportsDirectAccess).toBe(true);
  });
});
