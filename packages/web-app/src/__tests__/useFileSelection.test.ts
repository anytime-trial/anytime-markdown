/**
 * useFileSelection hook のユニットテスト
 */

import { renderHook, act } from "@testing-library/react";

// helpers の fetchCommits をモック
jest.mock("../components/explorer/helpers", () => ({
  fetchCommits: jest.fn(),
}));

import { useFileSelection } from "../components/explorer/hooks/useFileSelection";
import { fetchCommits } from "../components/explorer/helpers";

const mockFetchCommits = fetchCommits as jest.MockedFunction<typeof fetchCommits>;

// sessionStorage のモック
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock });

beforeEach(() => {
  mockFetchCommits.mockReset();
  sessionStorageMock.clear();
});

const defaultArgs = {
  selectedRepo: { fullName: "user/repo", private: false, defaultBranch: "main" },
  selectedBranch: "main",
  onSelectFile: jest.fn(),
  onSelectCommit: jest.fn(),
  onSelectCurrentProp: jest.fn(),
};

describe("useFileSelection", () => {
  it("初期状態が正しい", () => {
    const { result } = renderHook(() => useFileSelection(defaultArgs));
    expect(result.current.selectedFilePath).toBeNull();
    expect(result.current.commits).toEqual([]);
    expect(result.current.commitsLoading).toBe(false);
    expect(result.current.selectedSha).toBeNull();
    expect(result.current.commitsStale).toBe(false);
  });

  it("handleFileSelect がファイルを選択しコミットを取得する", async () => {
    const commitData = {
      commits: [{ sha: "abc", message: "init", author: "user", date: "2025-01-01" }],
      stale: false,
    };
    mockFetchCommits.mockResolvedValue(commitData);

    const onSelectFile = jest.fn();
    const { result } = renderHook(() =>
      useFileSelection({ ...defaultArgs, onSelectFile }),
    );

    await act(async () => {
      await result.current.handleFileSelect("README.md");
    });

    expect(result.current.selectedFilePath).toBe("README.md");
    expect(result.current.commits).toEqual(commitData.commits);
    expect(result.current.commitsStale).toBe(false);
    expect(onSelectFile).toHaveBeenCalledWith("user/repo", "README.md", "main");
  });

  it("handleFileSelect が sessionStorage に保存する", async () => {
    mockFetchCommits.mockResolvedValue({ commits: [], stale: false });

    const { result } = renderHook(() => useFileSelection(defaultArgs));

    await act(async () => {
      await result.current.handleFileSelect("test.md");
    });

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      "explorerSelection",
      expect.stringContaining("test.md"),
    );
  });

  it("handleCommitSelect がコミットを選択する", async () => {
    mockFetchCommits.mockResolvedValue({ commits: [], stale: false });
    const onSelectCommit = jest.fn();
    const { result } = renderHook(() =>
      useFileSelection({ ...defaultArgs, onSelectCommit }),
    );

    // ファイルを選択してから
    await act(async () => {
      await result.current.handleFileSelect("test.md");
    });

    act(() => {
      result.current.handleCommitSelect("sha123");
    });

    expect(result.current.selectedSha).toBe("sha123");
    expect(onSelectCommit).toHaveBeenCalledWith("user/repo", "test.md", "sha123");
  });

  it("handleCommitSelect は repo が null の場合何もしない", () => {
    const { result } = renderHook(() =>
      useFileSelection({ ...defaultArgs, selectedRepo: null }),
    );

    act(() => {
      result.current.handleCommitSelect("sha123");
    });

    expect(result.current.selectedSha).toBeNull();
  });

  it("handleSelectCurrent が onSelectCurrentProp を呼ぶ", async () => {
    mockFetchCommits.mockResolvedValue({ commits: [], stale: false });
    const onSelectCurrentProp = jest.fn();
    const { result } = renderHook(() =>
      useFileSelection({ ...defaultArgs, onSelectCurrentProp }),
    );

    await act(async () => {
      await result.current.handleFileSelect("test.md");
    });

    act(() => result.current.handleSelectCurrent());

    expect(onSelectCurrentProp).toHaveBeenCalled();
    expect(result.current.selectedSha).toBeNull();
  });

  it("handleSelectCurrent で onSelectCurrentProp 未指定時は onSelectFile を呼ぶ", async () => {
    mockFetchCommits.mockResolvedValue({ commits: [], stale: false });
    const onSelectFile = jest.fn();
    const { result } = renderHook(() =>
      useFileSelection({ ...defaultArgs, onSelectFile, onSelectCurrentProp: undefined }),
    );

    await act(async () => {
      await result.current.handleFileSelect("test.md");
    });

    onSelectFile.mockClear();
    act(() => result.current.handleSelectCurrent());

    expect(onSelectFile).toHaveBeenCalledWith("user/repo", "test.md", "main");
  });

  it("newCommit が設定されるとコミットリストの先頭に追加される", () => {
    const newCommit = { sha: "new1", message: "new commit", author: "user", date: "2025-06-01" };
    const { result, rerender } = renderHook(
      (props) => useFileSelection(props),
      { initialProps: { ...defaultArgs, newCommit: undefined as typeof newCommit | undefined } },
    );

    rerender({ ...defaultArgs, newCommit });

    expect(result.current.commits[0]).toEqual(newCommit);
    expect(result.current.commitsStale).toBe(false);
  });

  it("重複する newCommit は追加されない", () => {
    const newCommit = { sha: "dup1", message: "msg", author: "user", date: "2025-06-01" };
    const { result, rerender } = renderHook(
      (props) => useFileSelection(props),
      { initialProps: { ...defaultArgs, newCommit: undefined as typeof newCommit | undefined } },
    );

    rerender({ ...defaultArgs, newCommit });
    const len1 = result.current.commits.length;

    // 同じ sha で再レンダー (参照は別オブジェクト)
    rerender({ ...defaultArgs, newCommit: { ...newCommit } });
    expect(result.current.commits.length).toBe(len1);
  });
});
