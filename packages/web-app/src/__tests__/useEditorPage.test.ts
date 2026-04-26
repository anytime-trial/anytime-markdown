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

const mockT = (key: string) => key;

function createHookOptions(overrides: Partial<Parameters<typeof useEditorPage>[0]> = {}) {
  return {
    isGitHubLoggedIn: false,
    session: null,
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
      expect(result.current.explorerOpen).toBe(false);
      expect(result.current.externalContent).toBeUndefined();
      expect(result.current.externalFileName).toBeUndefined();
      expect(result.current.externalFilePath).toBeUndefined();
      expect(result.current.externalCompareContent).toBeNull();
      expect(result.current.editorKey).toBe(0);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.newCommit).toBeNull();
      expect(result.current.saveSnackbar).toBeNull();
      expect(result.current.ssoSnackbar).toBeNull();
    });

    it("sessionStorage に explorerOpen=1 がある場合 true で初期化", () => {
      sessionStorage.setItem("explorerOpen", "1");
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      expect(result.current.explorerOpen).toBe(true);
    });
  });

  describe("handleToggleExplorer", () => {
    it("エクスプローラの開閉を切り替える", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      expect(result.current.explorerOpen).toBe(false);
      act(() => result.current.handleToggleExplorer());
      expect(result.current.explorerOpen).toBe(true);
      act(() => result.current.handleToggleExplorer());
      expect(result.current.explorerOpen).toBe(false);
    });

    it("explorerOpen の変更が sessionStorage に反映される", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.handleToggleExplorer());
      expect(sessionStorage.getItem("explorerOpen")).toBe("1");
      act(() => result.current.handleToggleExplorer());
      expect(sessionStorage.getItem("explorerOpen")).toBe("0");
    });
  });

  describe("handleContentChange", () => {
    it("originalContent が未設定の場合 isDirty を変更しない", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.handleContentChange("new content"));
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("handleExplorerSelectFile", () => {
    it("ファイル選択でコンテンツを取得しエディタをリセットする", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Hello");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );
      const initialKey = result.current.editorKey;

      await act(async () => {
        await result.current.handleExplorerSelectFile("owner/repo", "README.md", "main");
      });

      expect(fetchFileFn).toHaveBeenCalledWith("owner/repo", "README.md", "main");
      expect(result.current.externalFileName).toBe("README.md");
      expect(result.current.externalFilePath).toBe("README.md");
      expect(result.current.isDirty).toBe(false);
      expect(result.current.editorKey).toBeGreaterThan(initialKey);
    });

    it("同じファイルを再選択しても再取得しない", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Hello");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );

      await act(async () => {
        await result.current.handleExplorerSelectFile("owner/repo", "README.md", "main");
      });
      const keyAfterFirst = result.current.editorKey;
      fetchFileFn.mockClear();

      await act(async () => {
        await result.current.handleExplorerSelectFile("owner/repo", "README.md", "main");
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
        await result.current.handleExplorerSelectFile("owner/repo", "docs/guide/intro.md", "main");
      });

      expect(result.current.externalFileName).toBe("intro.md");
      expect(result.current.externalFilePath).toBe("docs/guide/intro.md");
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
        await result.current.handleExplorerSelectFile("owner/repo", "README.md", "main");
      });

      await act(async () => {
        await result.current.handleExternalSave("# Updated");
      });

      expect(fetchFn).toHaveBeenCalledWith("/api/github/content", expect.objectContaining({
        method: "PUT",
      }));
      expect(result.current.isDirty).toBe(false);
      expect(result.current.newCommit).toEqual(
        expect.objectContaining({ sha: "abc" }),
      );
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
        await result.current.handleExplorerSelectFile("owner/repo", "README.md", "main");
      });

      await act(async () => {
        await result.current.handleExternalSave("# Updated");
      });

      expect(result.current.saveSnackbar).toEqual({ message: "saveError", severity: "error" });
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
    it("比較モードを有効にする", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      act(() => result.current.handleCompareModeChange(true));
      // compareModeOpen は内部状態なので、handleSelectCurrent の挙動で確認
    });
  });

  describe("handleExplorerSelectCommit", () => {
    it("通常モードでコミット選択するとエディタにコンテンツを表示する", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("# Commit content");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );
      const initialKey = result.current.editorKey;

      await act(async () => {
        await result.current.handleExplorerSelectCommit("owner/repo", "README.md", "sha123");
      });

      expect(fetchFileFn).toHaveBeenCalledWith("owner/repo", "README.md", "sha123");
      expect(result.current.externalContent).toBe("# Commit content");
      expect(result.current.externalFileName).toBe("README.md");
      expect(result.current.editorKey).toBeGreaterThan(initialKey);
    });

    it("fetchFileContent が空文字を返した場合でも表示する", async () => {
      const fetchFileFn = jest.fn().mockResolvedValue("");
      const { result } = renderHook(() =>
        useEditorPage(createHookOptions({ fetchFileFn })),
      );

      await act(async () => {
        await result.current.handleExplorerSelectCommit("owner/repo", "empty.md", "sha456");
      });

      expect(result.current.externalContent).toBe("");
    });
  });

  describe("handleSelectCurrent", () => {
    it("通常モードで編集中データに戻す", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));
      const initialKey = result.current.editorKey;

      act(() => result.current.handleSelectCurrent());

      expect(result.current.externalContent).toBeUndefined();
      expect(result.current.externalCompareContent).toBeNull();
      expect(result.current.editorKey).toBeGreaterThan(initialKey);
    });

    it("比較モードでは右側を空にしてモード維持", () => {
      const { result } = renderHook(() => useEditorPage(createHookOptions()));

      act(() => result.current.handleCompareModeChange(true));
      act(() => result.current.handleSelectCurrent());

      expect(result.current.externalCompareContent).toBe("");
    });
  });

  describe("SSO ログイン", () => {
    it("isGitHubLoggedIn が true になると explorerOpen が true になる", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ isGitHubLoggedIn: false }) },
      );
      expect(result.current.explorerOpen).toBe(false);

      rerender(createHookOptions({ isGitHubLoggedIn: true }));
      expect(result.current.explorerOpen).toBe(true);
    });

    it("セッション変更時に ssoSnackbar が表示される", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ session: null }) },
      );

      rerender(createHookOptions({ session: { user: { name: "test" } } }));
      expect(result.current.ssoSnackbar).toBe("githubConnected");
    });

    it("ログアウト時に disconnected メッセージが表示される", () => {
      const { result, rerender } = renderHook(
        (props) => useEditorPage(props),
        { initialProps: createHookOptions({ session: { user: { name: "test" } } }) },
      );

      rerender(createHookOptions({ session: null }));
      expect(result.current.ssoSnackbar).toBe("githubDisconnected");
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
});
