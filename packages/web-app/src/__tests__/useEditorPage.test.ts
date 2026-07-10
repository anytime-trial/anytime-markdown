/**
 * useEditorPage hook のユニットテスト
 */

import { renderHook, act } from "@testing-library/react";

import { useEditorPage } from "../app/markdown/useEditorPage";

// WebFileSystemProvider / FallbackFileSystemProvider のモック
jest.mock("../lib/WebFileSystemProvider", () => ({
  WebFileSystemProvider: jest.fn().mockImplementation(() => ({
    supportsDirectAccess: false,
  })),
}));
jest.mock("../lib/FallbackFileSystemProvider", () => ({
  FallbackFileSystemProvider: jest.fn().mockImplementation(() => ({
    type: "fallback",
  })),
}));
jest.mock("../lib/githubApi", () => ({
  fetchFileContent: jest.fn(),
}));
jest.mock("../lib/googlePicker", () => ({
  pickDriveMarkdownFile: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickDriveMarkdownFile } = jest.requireMock("../lib/googlePicker") as {
  pickDriveMarkdownFile: jest.Mock;
};

const mockT = (key: string) => key;

function createHookOptions(overrides: Partial<Parameters<typeof useEditorPage>[0]> = {}) {
  return {
    isGitHubConnected: false,
    t: mockT,
    fetchFileFn: jest.fn().mockResolvedValue("# Mock content"),
    fetchFn: jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch,
    ...overrides,
  };
}

describe("useEditorPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe("初期状態", () => {
    it("デフォルトの初期値が正しい", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      expect(result.current.externalContent).toBeUndefined();
      expect(result.current.externalFileName).toBeUndefined();
      expect(result.current.externalCompareContent).toBeNull();
      expect(result.current.editorKey).toBe(0);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.saveSnackbar).toBeNull();
      expect(result.current.ssoSnackbar).toBeNull();
    });
  });

  describe("handleContentChange", () => {
    it("originalContent が未設定の場合 isDirty を変更しない", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.handleContentChange("new content"));
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("handleGitHubOpenFile", () => {
    it("ファイル選択でコンテンツを取得しエディタをリセットする", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Hello");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );
      const initialKey = result.current.editorKey;

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });

      expect(fetchFileFn).toHaveBeenCalledWith("owner/repo", "README.md", "main");
      expect(result.current.externalFileName).toBe("README.md");
      expect(result.current.isDirty).toBe(false);
      expect(result.current.editorKey).toBeGreaterThan(initialKey);
    });

    it("同じファイルを再選択しても再取得しない", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Hello");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });
      const keyAfterFirst = result.current.editorKey;
      fetchFileFn.mockClear();

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });

      expect(fetchFileFn).not.toHaveBeenCalled();
      expect(result.current.editorKey).toBe(keyAfterFirst);
    });

    it("ネストされたパスからファイル名を抽出する", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("content");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "docs/guide/intro.md", "main");
      });

      expect(result.current.externalFileName).toBe("intro.md");
    });
  });

  describe("handleExternalSave", () => {
    it("保存成功時に isDirty をリセットし snackbar を表示する", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Original");
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ commit: { sha: "abc", message: "update", author: "user", date: "2026-01-01" } }),
      }) as unknown as typeof fetch;

      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn, fetchFn })),
      );

      // ファイルを選択してから保存
      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });

      // GitHub 経路の handleExternalSave はコミットメッセージ確定まで解決しないため await しない。
      await act(async () => {
        void result.current.handleExternalSave("# Updated");
      });

      // GitHub 保存はコミットメッセージダイアログを経由する（Task10）。
      expect(result.current.commitMessageDialog).toEqual(
        expect.objectContaining({ open: true, defaultMessage: "Update README.md" }),
      );
      expect(fetchFn).not.toHaveBeenCalledWith("/api/github/content", expect.anything());

      await act(async () => {
        await result.current.handleCommitMessageConfirm("update", false);
      });

      expect(fetchFn).toHaveBeenCalledWith("/api/github/content", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          repo: "owner/repo",
          path: "README.md",
          content: "# Updated",
          branch: "main",
          message: "update",
        }),
      }));
      expect(result.current.commitMessageDialog).toBeNull();
      expect(result.current.isDirty).toBe(false);
      expect(result.current.saveSnackbar).toEqual({ message: "fileSaved", severity: "success" });
    });

    it("保存失敗時にエラー snackbar を表示する", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Original");
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Conflict" }),
      }) as unknown as typeof fetch;

      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn, fetchFn })),
      );

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });

      // GitHub 経路の handleExternalSave はコミットメッセージ確定まで解決しないため await しない。
      await act(async () => {
        void result.current.handleExternalSave("# Updated");
      });

      await act(async () => {
        await result.current.handleCommitMessageConfirm("update", false);
      });

      expect(result.current.saveSnackbar).toEqual({ message: "saveError", severity: "error" });
    });

    it("コミットメッセージダイアログをキャンセルすると保存しない", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Original");
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn, fetchFn: fetchFn as unknown as typeof fetch })),
      );

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });
      fetchFn.mockClear();

      // GitHub 経路の handleExternalSave はコミットメッセージ確定まで解決しないため await しない。
      await act(async () => {
        void result.current.handleExternalSave("# Updated");
      });
      act(() => result.current.handleCommitMessageCancel());

      expect(result.current.commitMessageDialog).toBeNull();
      expect(fetchFn).not.toHaveBeenCalledWith("/api/github/content", expect.anything());
      expect(result.current.saveSnackbar).toBeNull();
    });

    it("「次回から同じメッセージを使う」を選ぶと以降の保存でダイアログをスキップする", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Original");
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn, fetchFn: fetchFn as unknown as typeof fetch })),
      );

      await act(async () => {
        await result.current.handleGitHubOpenFile("owner/repo", "README.md", "main");
      });

      // 初回はコミットメッセージ確定まで解決しないため await しない。
      await act(async () => {
        void result.current.handleExternalSave("# Updated once");
      });
      await act(async () => {
        await result.current.handleCommitMessageConfirm("remembered message", true);
      });
      fetchFn.mockClear();

      await act(async () => {
        await result.current.handleExternalSave("# Updated twice");
      });

      // 2回目は remember 済みのため、ダイアログを経由せず即座に PUT される。
      expect(result.current.commitMessageDialog).toBeNull();
      expect(fetchFn).toHaveBeenCalledWith("/api/github/content", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          repo: "owner/repo",
          path: "README.md",
          content: "# Updated twice",
          branch: "main",
          message: "remembered message",
        }),
      }));
    });

    it("ファイル未選択時は保存しない", async () => {
      const fetchFn = jest.fn() as unknown as typeof fetch;
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn })),
      );

      await act(async () => {
        await result.current.handleExternalSave("# Content");
      });

      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe("handleCompareModeChange", () => {
    it("比較モードの切替は本文とエディタ再生成に影響しない", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.handleCompareModeChange(true));
      expect(result.current.externalContent).toBeUndefined();
      expect(result.current.externalCompareContent).toBeNull();
      expect(result.current.editorKey).toBe(0);
    });
  });

  describe("SSO ログイン", () => {
    it("GitHub 接続時に ssoSnackbar が表示される", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ isGitHubConnected: false }) },
      );

      rerender(createHookOptions({ isGitHubConnected: true }));
      expect(result.current.ssoSnackbar).toBe("githubConnected");
    });

    it("ログアウト時に disconnected メッセージが表示される", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ isGitHubConnected: true }) },
      );

      rerender(createHookOptions({ isGitHubConnected: false }));
      expect(result.current.ssoSnackbar).toBe("githubDisconnected");
    });

    it("セッション読込中から接続済みへ確定しただけでは snackbar を出さない（リロード時の誤通知）", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ isGitHubConnected: undefined }) },
      );

      // useSession は最初 status:'loading'（未確定）を返し、その後 GitHub 接続済みが判明する。
      rerender(createHookOptions({ isGitHubConnected: true }));
      expect(result.current.ssoSnackbar).toBeNull();
    });

    it("未確定→未接続→接続の遷移では接続時のみ snackbar を出す", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ isGitHubConnected: undefined }) },
      );

      rerender(createHookOptions({ isGitHubConnected: false }));
      expect(result.current.ssoSnackbar).toBeNull();

      rerender(createHookOptions({ isGitHubConnected: true }));
      expect(result.current.ssoSnackbar).toBe("githubConnected");
    });

    it("GitHub 未接続のままなら本文クリアも snackbar も起きない（Google のみサインイン相当）", () => {
      localStorage.setItem("anytime-markdown-content", "draft");
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ isGitHubConnected: false }) },
      );

      // Google サインインで session は非 null になるが GitHub は未接続のまま。
      rerender(createHookOptions({ isGitHubConnected: false }));
      expect(result.current.ssoSnackbar).toBeNull();
      expect(result.current.externalContent).toBeUndefined();
      expect(localStorage.getItem("anytime-markdown-content")).toBe("draft");
    });
  });

  describe("snackbar 制御", () => {
    it("setSsoSnackbar で snackbar を制御できる", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.setSsoSnackbar("test message"));
      expect(result.current.ssoSnackbar).toBe("test message");
      act(() => result.current.setSsoSnackbar(null));
      expect(result.current.ssoSnackbar).toBeNull();
    });

    it("setSaveSnackbar で snackbar を制御できる", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.setSaveSnackbar({ message: "saved", severity: "success" }));
      expect(result.current.saveSnackbar).toEqual({ message: "saved", severity: "success" });
      act(() => result.current.setSaveSnackbar(null));
      expect(result.current.saveSnackbar).toBeNull();
    });
  });

  describe("handleExternalSave の保存完了通知（未保存ガード連携）", () => {
    const originalApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    const originalAppId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

    afterEach(() => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = originalApiKey;
      process.env.NEXT_PUBLIC_GOOGLE_APP_ID = originalAppId;
    });

    /** Drive で開いた状態にする（POST 経由で driveFileRef を持たせる）。 */
    async function makeDriveFile(
      current: () => { handleSaveToDriveConfirm: (name: string) => Promise<void> },
      fetchFn: jest.Mock,
    ): Promise<void> {
      fetchFn.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fileId: "f1", name: "note.md", headRevisionId: "rev1" }),
      });
      await act(async () => { await current().handleSaveToDriveConfirm("note.md"); });
      fetchFn.mockClear();
    }

    it("Drive 保存が成功したら true を返す", async () => {
      const fetchFn = jest.fn();
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );
      await makeDriveFile(() => result.current, fetchFn);

      fetchFn.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ headRevisionId: "rev2" }) });
      let saved: boolean | undefined;
      await act(async () => { saved = await result.current.handleExternalSave("body"); });

      expect(saved).toBe(true);
    });

    it("Drive 保存が 409 競合なら false を返す（本文を破棄させない）", async () => {
      const fetchFn = jest.fn();
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );
      await makeDriveFile(() => result.current, fetchFn);

      fetchFn.mockResolvedValueOnce({ status: 409, ok: false, json: () => Promise.resolve({ headRevisionId: "rev9" }) });
      let saved: boolean | undefined;
      await act(async () => { saved = await result.current.handleExternalSave("body"); });

      expect(saved).toBe(false);
      expect(result.current.driveConflict).not.toBeNull();
    });

    it("Drive 保存が失敗したら false を返す", async () => {
      const fetchFn = jest.fn();
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );
      await makeDriveFile(() => result.current, fetchFn);

      fetchFn.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) });
      let saved: boolean | undefined;
      await act(async () => { saved = await result.current.handleExternalSave("body"); });

      expect(saved).toBe(false);
    });

    it("GitHub 経路はコミットメッセージ確定まで解決せず、確定で true を返す", async () => {
      const fetchFn = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch, isGitHubConnected: true })),
      );
      await act(async () => { await result.current.handleGitHubOpenFile("o/r", "a.md", "main"); });

      let saved: boolean | undefined;
      let settled = false;
      await act(async () => {
        void result.current.handleExternalSave("body").then((v) => { saved = v; settled = true; });
      });
      expect(settled).toBe(false);
      expect(result.current.commitMessageDialog?.open).toBe(true);

      await act(async () => { await result.current.handleCommitMessageConfirm("msg", false); });
      expect(saved).toBe(true);
    });

    it("GitHub 経路でコミットメッセージをキャンセルしたら false を返す", async () => {
      const fetchFn = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch, isGitHubConnected: true })),
      );
      await act(async () => { await result.current.handleGitHubOpenFile("o/r", "a.md", "main"); });

      let saved: boolean | undefined;
      await act(async () => {
        void result.current.handleExternalSave("body").then((v) => { saved = v; });
      });
      await act(async () => { result.current.handleCommitMessageCancel(); });

      expect(saved).toBe(false);
    });

    it("保存先が無ければ false を返す", async () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      let saved: boolean | undefined;
      await act(async () => { saved = await result.current.handleExternalSave("body"); });
      expect(saved).toBe(false);
    });
  });

  describe("Drive への新規保存", () => {
    it("handleSaveToDriveClick でファイル名ダイアログが開く（既定名は現在のファイル名）", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.handleSaveToDriveClick("note.md"));
      expect(result.current.driveSaveAsDialog).toEqual({ open: true, defaultName: "note.md" });
    });

    it("確定すると POST /api/drive/content を呼び、以後の保存先が新ファイルになる", async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fileId: "new-1", name: "note.md", headRevisionId: "rev1" }),
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn })));

      act(() => result.current.handleSaveToDriveClick("note.md"));
      await act(async () => {
        await result.current.handleSaveToDriveConfirm("note.md");
      });

      const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
      expect(url).toBe("/api/drive/content");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ name: "note.md", content: "" });
      expect(result.current.driveSaveAsDialog).toBeNull();
      expect(result.current.hasDriveFile).toBe(true);
      expect(result.current.saveSnackbar).toEqual({ message: "fileSaved", severity: "success" });
    });

    it("失敗時は driveCreateError を通知し保存先を切り替えない", async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: "forbidden" }),
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn })));

      await act(async () => {
        await result.current.handleSaveToDriveConfirm("note.md");
      });

      expect(result.current.hasDriveFile).toBe(false);
      expect(result.current.saveSnackbar).toEqual({
        message: "driveCreateError",
        severity: "error",
      });
    });

    it("未サインイン（401）なら google サインインへ遷移する", async () => {
      const signInFn = jest.fn().mockResolvedValue(undefined);
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Not authenticated" }),
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn, signInFn })));

      await act(async () => {
        await result.current.handleSaveToDriveConfirm("note.md");
      });

      expect(signInFn).toHaveBeenCalledWith("google", { callbackUrl: window.location.href });
      expect(result.current.saveSnackbar).toBeNull();
    });

    it("キャンセルでダイアログが閉じ、fetch を呼ばない", () => {
      const fetchFn = jest.fn() as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn })));
      act(() => result.current.handleSaveToDriveClick("note.md"));
      act(() => result.current.handleSaveToDriveCancel());
      expect(result.current.driveSaveAsDialog).toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe("handleDriveOpen", () => {
    const originalApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    const originalAppId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_GOOGLE_APP_ID = "319387139351";
    });

    afterEach(() => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = originalApiKey;
      process.env.NEXT_PUBLIC_GOOGLE_APP_ID = originalAppId;
    });

    it("appId 未設定なら driveApiKeyMissing を通知しサインインへ進まない", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      process.env.NEXT_PUBLIC_GOOGLE_APP_ID = "";
      const signInFn = jest.fn();
      const { result } = renderHook(() => useEditorPage(createHookOptions({ signInFn })));

      await act(async () => {
        await result.current.handleDriveOpen();
      });

      expect(signInFn).not.toHaveBeenCalled();
      expect(result.current.saveSnackbar).toEqual({
        message: "driveApiKeyMissing",
        severity: "error",
      });
    });

    it("API キー未設定なら driveApiKeyMissing を通知しサインインへ進まない", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "";
      const signInFn = jest.fn();
      const { result } = renderHook(() => useEditorPage(createHookOptions({ signInFn })));

      await act(async () => {
        await result.current.handleDriveOpen();
      });

      expect(signInFn).not.toHaveBeenCalled();
      expect(result.current.saveSnackbar).toEqual({
        message: "driveApiKeyMissing",
        severity: "error",
      });
    });

    it("Google トークン未取得（401）なら google サインインへ遷移する", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const signInFn = jest.fn().mockResolvedValue(undefined);
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Not authenticated" }),
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn, signInFn })));

      await act(async () => {
        await result.current.handleDriveOpen();
      });

      expect(signInFn).toHaveBeenCalledWith("google", { callbackUrl: window.location.href });
      expect(result.current.saveSnackbar).toBeNull();
    });

    it("トークン応答に accessToken が無ければ google サインインへ遷移する", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const signInFn = jest.fn().mockResolvedValue(undefined);
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn, signInFn })));

      await act(async () => {
        await result.current.handleDriveOpen();
      });

      expect(signInFn).toHaveBeenCalledWith("google", { callbackUrl: window.location.href });
    });

    it("サインイン起動に失敗したら driveSignInRequired を通知する", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const signInFn = jest.fn().mockRejectedValue(new Error("popup blocked"));
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => useEditorPage(createHookOptions({ fetchFn, signInFn })));

      await act(async () => {
        await result.current.handleDriveOpen();
      });

      expect(result.current.saveSnackbar).toEqual({
        message: "driveSignInRequired",
        severity: "error",
      });
    });

    /** トークン取得に成功する fetchFn を作る（以降の応答は呼び出し側が積む）。 */
    function createAuthedFetch(): jest.Mock {
      const fetchFn = jest.fn();
      fetchFn.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accessToken: "tok" }) });
      return fetchFn;
    }

    it("選択したファイルの本文を読み込み保存先を Drive にする", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const fetchFn = createAuthedFetch();
      pickDriveMarkdownFile.mockResolvedValueOnce({ fileId: "f1" });
      fetchFn.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: "note.md", headRevisionId: "rev1", content: "# body" }),
      });
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );
      const keyBefore = result.current.editorKey;

      await act(async () => { await result.current.handleDriveOpen(); });

      expect(fetchFn).toHaveBeenLastCalledWith("/api/drive/content?fileId=f1");
      expect(result.current.externalFileName).toBe("note.md");
      expect(result.current.externalSaveKind).toBe("drive");
      expect(result.current.hasDriveFile).toBe(true);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.editorKey).toBe(keyBefore + 1);
      expect(result.current.saveSnackbar).toBeNull();
    });

    it("fileId を URL エンコードして問い合わせる", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const fetchFn = createAuthedFetch();
      pickDriveMarkdownFile.mockResolvedValueOnce({ fileId: "a b/c" });
      fetchFn.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: "n.md", headRevisionId: "r", content: "" }),
      });
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );

      await act(async () => { await result.current.handleDriveOpen(); });

      expect(fetchFn).toHaveBeenLastCalledWith("/api/drive/content?fileId=a%20b%2Fc");
    });

    it("Picker をキャンセルしたら本文を読みに行かない", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const fetchFn = createAuthedFetch();
      pickDriveMarkdownFile.mockResolvedValueOnce(null);
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );

      await act(async () => { await result.current.handleDriveOpen(); });

      expect(fetchFn).toHaveBeenCalledTimes(1); // トークン取得のみ
      expect(result.current.hasDriveFile).toBe(false);
      expect(result.current.externalSaveKind).toBeUndefined();
    });

    it("本文取得が失敗したら driveLoadError を通知し保存先を切り替えない", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const fetchFn = createAuthedFetch();
      pickDriveMarkdownFile.mockResolvedValueOnce({ fileId: "f1" });
      fetchFn.mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );

      await act(async () => { await result.current.handleDriveOpen(); });

      expect(result.current.saveSnackbar).toEqual({ message: "driveLoadError", severity: "error" });
      expect(result.current.hasDriveFile).toBe(false);
      expect(result.current.externalSaveKind).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("本文応答の形が想定外なら driveLoadError を通知し保存先を切り替えない", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "test-api-key";
      const fetchFn = createAuthedFetch();
      pickDriveMarkdownFile.mockResolvedValueOnce({ fileId: "f1" });
      fetchFn.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ name: "n.md" }) });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFn: fetchFn as unknown as typeof fetch })),
      );

      await act(async () => { await result.current.handleDriveOpen(); });

      expect(result.current.saveSnackbar).toEqual({ message: "driveLoadError", severity: "error" });
      expect(result.current.hasDriveFile).toBe(false);
      warnSpy.mockRestore();
    });
  });
});
