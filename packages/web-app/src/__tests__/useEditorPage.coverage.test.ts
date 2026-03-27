/**
 * Additional coverage for useEditorPage - session changes, compare mode, save
 */
import { renderHook, act } from "@testing-library/react";

jest.mock("@anytime-markdown/markdown-core/src/constants/storageKeys", () => ({
  STORAGE_KEY_CONTENT: "anytime-markdown-content",
}));

jest.mock("../lib/WebFileSystemProvider", () => ({
  WebFileSystemProvider: jest.fn().mockImplementation(() => ({
    supportsDirectAccess: false,
  })),
}));

jest.mock("../lib/FallbackFileSystemProvider", () => ({
  FallbackFileSystemProvider: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../lib/githubApi", () => ({
  fetchFileContent: jest.fn().mockResolvedValue("# Test"),
}));

import { useEditorPage } from "../app/markdown/useEditorPage";

describe("useEditorPage - additional coverage", () => {
  const defaultOptions = {
    isGitHubLoggedIn: false,
    session: null,
    t: (key: string) => key,
    fetchFileFn: jest.fn().mockResolvedValue("# Test content"),
    fetchFn: jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ commit: { sha: "abc", message: "test", author: "user", date: "2024-01-01" } }),
    }) as any,
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("toggles explorer", () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));
    expect(result.current.explorerOpen).toBe(false);

    act(() => {
      result.current.handleToggleExplorer();
    });
    expect(result.current.explorerOpen).toBe(true);
  });

  it("handles file selection", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectFile("repo", "file.md", "main");
    });

    expect(defaultOptions.fetchFileFn).toHaveBeenCalledWith("repo", "file.md", "main");
    expect(result.current.externalFileName).toBe("file.md");
    expect(result.current.externalFilePath).toBe("file.md");
  });

  it("skips re-fetch for same file", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectFile("repo", "file.md", "main");
    });

    defaultOptions.fetchFileFn.mockClear();
    await act(async () => {
      await result.current.handleExplorerSelectFile("repo", "file.md", "main");
    });
    expect(defaultOptions.fetchFileFn).not.toHaveBeenCalled();
  });

  it("handles external save", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    // First select a file
    await act(async () => {
      await result.current.handleExplorerSelectFile("repo", "file.md", "main");
    });

    // Then save
    await act(async () => {
      await result.current.handleExternalSave("# Updated content");
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.newCommit).toBeTruthy();
    expect(result.current.saveSnackbar?.severity).toBe("success");
  });

  it("handles save failure", async () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const failFetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Failed" }),
    });

    const { result } = renderHook(() =>
      useEditorPage({ ...defaultOptions, fetchFn: failFetch })
    );

    await act(async () => {
      await result.current.handleExplorerSelectFile("repo", "file.md", "main");
    });

    await act(async () => {
      await result.current.handleExternalSave("# Updated content");
    });
    expect(result.current.saveSnackbar?.severity).toBe("error");
    consoleSpy.mockRestore();
  });

  it("tracks content changes for isDirty", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectFile("repo", "file.md", "main");
    });

    act(() => {
      result.current.handleContentChange("# Modified content");
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.handleContentChange("# Test content");
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("handles compare mode", () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    act(() => {
      result.current.handleCompareModeChange(true);
    });
  });

  it("handles commit selection in compare mode", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    // Enable compare mode first
    act(() => {
      result.current.handleCompareModeChange(true);
    });

    await act(async () => {
      await result.current.handleExplorerSelectCommit("repo", "file.md", "abc123");
    });
  });

  it("handles commit selection outside compare mode", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectCommit("repo", "file.md", "abc123");
    });
    expect(result.current.externalFileName).toBe("file.md");
  });

  it("handles selectCurrent", () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    act(() => {
      result.current.handleSelectCurrent();
    });
  });

  it("handles session change - login", () => {
    const { result, rerender } = renderHook(
      ({ session }) => useEditorPage({ ...defaultOptions, session }),
      { initialProps: { session: null as any } }
    );

    rerender({ session: { user: { name: "test" } } });
    expect(result.current.ssoSnackbar).toBe("githubConnected");
  });

  it("handles session change - logout", () => {
    const { result, rerender } = renderHook(
      ({ session }) => useEditorPage({ ...defaultOptions, session }),
      { initialProps: { session: { user: { name: "test" } } as any } }
    );

    rerender({ session: null });
    expect(result.current.ssoSnackbar).toBe("githubDisconnected");
  });

  it("opens explorer when GitHub logged in", () => {
    const { result } = renderHook(() =>
      useEditorPage({ ...defaultOptions, isGitHubLoggedIn: true })
    );
    expect(result.current.explorerOpen).toBe(true);
  });

  it("clears localStorage on first SSO login", () => {
    localStorage.setItem("anytime-markdown-content", "old content");
    renderHook(() =>
      useEditorPage({ ...defaultOptions, isGitHubLoggedIn: true })
    );
    expect(localStorage.getItem("anytime-markdown-content")).toBeNull();
  });

  it("provides fileSystemProvider", () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));
    expect(result.current.fileSystemProvider).toBeTruthy();
  });

  it("setSsoSnackbar and setSaveSnackbar", () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    act(() => {
      result.current.setSsoSnackbar("test message");
    });
    expect(result.current.ssoSnackbar).toBe("test message");

    act(() => {
      result.current.setSaveSnackbar({ message: "Saved!", severity: "success" });
    });
    expect(result.current.saveSnackbar).toEqual({ message: "Saved!", severity: "success" });
  });

  it("restores explorerOpen from sessionStorage", () => {
    sessionStorage.setItem("explorerOpen", "1");
    const { result } = renderHook(() => useEditorPage(defaultOptions));
    expect(result.current.explorerOpen).toBe(true);
  });

  it("skips ssoContentCleared when already cleared", () => {
    sessionStorage.setItem("ssoContentCleared", "1");
    localStorage.setItem("anytime-markdown-content", "some content");
    renderHook(() =>
      useEditorPage({ ...defaultOptions, isGitHubLoggedIn: true })
    );
    expect(localStorage.getItem("anytime-markdown-content")).toBe("some content");
    sessionStorage.removeItem("ssoContentCleared");
  });

  it("handleExternalSave with successful response and commit data", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ commit: { sha: "abc", message: "saved", author: "user", date: "2025-01-01" } }),
    });
    const { result } = renderHook(() =>
      useEditorPage({ ...defaultOptions, fetchFn: mockFetch })
    );

    await act(async () => {
      await result.current.handleExplorerSelectFile("user/repo", "test.md", "main");
    });

    await act(async () => {
      await result.current.handleExternalSave("new content");
    });

    expect(result.current.saveSnackbar).toEqual(
      expect.objectContaining({ severity: "success" })
    );
    expect(result.current.newCommit).toBeTruthy();
  });

  it("handleExternalSave with failed response", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Conflict" }),
    });
    const { result } = renderHook(() =>
      useEditorPage({ ...defaultOptions, fetchFn: mockFetch })
    );

    await act(async () => {
      await result.current.handleExplorerSelectFile("user/repo", "test.md", "main");
    });

    await act(async () => {
      await result.current.handleExternalSave("new content");
    });

    expect(result.current.saveSnackbar).toEqual(
      expect.objectContaining({ severity: "error" })
    );
  });

  it("handleCompareModeChange with stored commit content", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectFile("user/repo", "test.md", "main");
    });

    await act(async () => {
      await result.current.handleExplorerSelectCommit("user/repo", "test.md", "sha123");
    });

    act(() => {
      result.current.handleCompareModeChange(true);
    });
  });

  it("handleExplorerSelectCommit in compare mode", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    act(() => {
      result.current.handleCompareModeChange(true);
    });

    await act(async () => {
      await result.current.handleExplorerSelectCommit("user/repo", "test.md", "sha456");
    });
  });

  it("handleSelectCurrent in compare mode", () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    act(() => {
      result.current.handleCompareModeChange(true);
    });

    act(() => {
      result.current.handleSelectCurrent();
    });
  });

  it("handleContentChange tracks dirty state", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectFile("user/repo", "test.md", "main");
    });

    act(() => {
      result.current.handleContentChange("modified content");
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("handleExplorerSelectFile same file twice does nothing", async () => {
    const { result } = renderHook(() => useEditorPage(defaultOptions));

    await act(async () => {
      await result.current.handleExplorerSelectFile("user/repo", "test.md", "main");
    });

    await act(async () => {
      await result.current.handleExplorerSelectFile("user/repo", "test.md", "main");
    });
  });
});
