/**
 * useRepositorySelection hook のユニットテスト
 */

import { renderHook, act } from "@testing-library/react";

// helpers の fetchBranches をモック
jest.mock("../components/explorer/helpers", () => ({
  fetchBranches: jest.fn(),
}));

import { useRepositorySelection } from "../components/explorer/hooks/useRepositorySelection";
import { fetchBranches } from "../components/explorer/helpers";

const mockFetchBranches = fetchBranches as jest.MockedFunction<typeof fetchBranches>;

beforeEach(() => {
  mockFetchBranches.mockReset();
});

const mockRepo = { fullName: "user/repo", private: false, defaultBranch: "main" };

describe("useRepositorySelection", () => {
  it("初期状態が正しい", () => {
    const loadTree = jest.fn();
    const { result } = renderHook(() => useRepositorySelection({ loadTree }));
    expect(result.current.selectedRepo).toBeNull();
    expect(result.current.selectedBranch).toBe("");
    expect(result.current.branches).toEqual([]);
    expect(result.current.branchDialogOpen).toBe(false);
    expect(result.current.branchDialogRepo).toBeNull();
    expect(result.current.branchesLoading).toBe(false);
  });

  it("handleSelectRepo がブランチ一覧を取得しダイアログを開く", async () => {
    mockFetchBranches.mockResolvedValue(["main", "develop", "feature/x"]);
    const loadTree = jest.fn();
    const { result } = renderHook(() => useRepositorySelection({ loadTree }));

    await act(async () => {
      await result.current.handleSelectRepo(mockRepo);
    });

    expect(result.current.branchDialogOpen).toBe(true);
    expect(result.current.branchDialogRepo).toEqual(mockRepo);
    // defaultBranch が先頭に来る
    expect(result.current.branches[0]).toBe("main");
    expect(result.current.branchesLoading).toBe(false);
  });

  it("handleSelectRepo がデフォルトブランチを先頭にソートする", async () => {
    mockFetchBranches.mockResolvedValue(["develop", "main", "feature"]);
    const loadTree = jest.fn();
    const { result } = renderHook(() => useRepositorySelection({ loadTree }));

    await act(async () => {
      await result.current.handleSelectRepo(mockRepo);
    });

    expect(result.current.branches[0]).toBe("main");
    // main が重複しないことを確認
    expect(result.current.branches.filter((b) => b === "main")).toHaveLength(1);
  });

  it("handleBranchSelect がブランチを選択しツリーをロードする", async () => {
    mockFetchBranches.mockResolvedValue(["main"]);
    const loadTree = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRepositorySelection({ loadTree }));

    // まずリポジトリ選択
    await act(async () => {
      await result.current.handleSelectRepo(mockRepo);
    });

    // ブランチ選択
    await act(async () => {
      await result.current.handleBranchSelect("main");
    });

    expect(result.current.branchDialogOpen).toBe(false);
    expect(result.current.selectedRepo).toEqual(mockRepo);
    expect(result.current.selectedBranch).toBe("main");
    expect(loadTree).toHaveBeenCalledWith(mockRepo, "main");
  });

  it("handleBranchSelect は branchDialogRepo が null の場合何もしない", async () => {
    const loadTree = jest.fn();
    const { result } = renderHook(() => useRepositorySelection({ loadTree }));

    await act(async () => {
      await result.current.handleBranchSelect("main");
    });

    expect(loadTree).not.toHaveBeenCalled();
    expect(result.current.selectedRepo).toBeNull();
  });

  it("handleBranchDialogClose がダイアログを閉じる", async () => {
    mockFetchBranches.mockResolvedValue(["main"]);
    const loadTree = jest.fn();
    const { result } = renderHook(() => useRepositorySelection({ loadTree }));

    await act(async () => {
      await result.current.handleSelectRepo(mockRepo);
    });

    act(() => result.current.handleBranchDialogClose());

    expect(result.current.branchDialogOpen).toBe(false);
    expect(result.current.branchDialogRepo).toBeNull();
  });
});
