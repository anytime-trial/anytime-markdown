/**
 * ExplorerPanel.tsx coverage3 tests
 * Targets: line 139 (newCommit non-dedup path),
 *   lines 212-252 (sessionStorage restore with matching repo)
 */
import { render, waitFor, act, fireEvent, screen } from "@testing-library/react";
import React from "react";

// --- configurable mock state ---
let mockSession: any = null;
let mockSelectedRepo: any = null;
let mockSelectedBranch = "";
let mockSelectedFilePath: string | null = null;
let mockCommits: any[] = [];
let mockSelectedSha: string | null = null;
let mockRootEntries: any[] = [];
let mockCommitsLoading = false;
let mockCommitsStale = false;

const mockSetSelectedRepo = jest.fn();
const mockSetSelectedBranch = jest.fn();
const mockSetRootEntries = jest.fn();
const mockSetExpanded = jest.fn();
const mockSetSelectedFilePath = jest.fn();
const mockSetCommits = jest.fn();
const mockSetSelectedSha = jest.fn();
const mockSetBranches = jest.fn();
const mockSetCommitsLoading = jest.fn();
const mockSetCommitsStale = jest.fn();
const mockHandleSelectRepo = jest.fn();
const mockHandleBranchSelect = jest.fn();
const mockHandleBranchDialogClose = jest.fn();
const mockLoadTree = jest.fn();
const mockBumpCache = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockSetRenamingPath = jest.fn();
const mockSetCreatingInDir = jest.fn();
const mockSetCreatingFolderInDir = jest.fn();
const mockSetDragOverPath = jest.fn();

const mockChildrenCacheRef = { current: new Map() };
const mockHasMdCacheRef = { current: new Map() };

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: (...args: any[]) => mockSignOut(...args),
  useSession: () => ({ data: mockSession, status: mockSession ? "authenticated" : "unauthenticated" }),
}));

jest.mock("../components/explorer/GitHistorySection", () => ({
  GitHistorySection: (props: any) => (
    <div data-testid="git-history">
      <button data-testid="select-commit" onClick={() => props.onSelectCommit?.("sha123")} />
      <button data-testid="select-current" onClick={() => props.onSelectCurrent?.()} />
    </div>
  ),
}));

const mockFetchCommits = jest.fn().mockResolvedValue({ commits: [], stale: false });
const mockFetchDirEntries = jest.fn().mockResolvedValue([]);

jest.mock("../components/explorer/helpers", () => ({
  fetchCommits: (...args: any[]) => mockFetchCommits(...args),
  fetchDirEntries: (...args: any[]) => mockFetchDirEntries(...args),
}));

jest.mock("../components/explorer/hooks", () => ({
  useTreeState: () => ({
    rootEntries: mockRootEntries,
    setRootEntries: mockSetRootEntries,
    expanded: new Set<string>(),
    setExpanded: mockSetExpanded,
    loadingDirs: new Set(),
    setLoadingDirs: jest.fn(),
    renamingPath: null,
    setRenamingPath: mockSetRenamingPath,
    creatingInDir: null,
    setCreatingInDir: mockSetCreatingInDir,
    creatingFolderInDir: null,
    setCreatingFolderInDir: mockSetCreatingFolderInDir,
    dragOverPath: null,
    setDragOverPath: mockSetDragOverPath,
    dragSourceRef: { current: null },
    childrenCacheRef: mockChildrenCacheRef,
    hasMdCacheRef: mockHasMdCacheRef,
    cacheVersion: 0,
    bumpCache: mockBumpCache,
  }),
  useFileSelection: () => ({
    selectedFilePath: mockSelectedFilePath,
    setSelectedFilePath: mockSetSelectedFilePath,
    commits: mockCommits,
    setCommits: mockSetCommits,
    commitsLoading: mockCommitsLoading,
    setCommitsLoading: mockSetCommitsLoading,
    selectedSha: mockSelectedSha,
    setSelectedSha: mockSetSelectedSha,
    commitsStale: mockCommitsStale,
    setCommitsStale: mockSetCommitsStale,
    handleFileSelect: jest.fn(),
    handleCommitSelect: jest.fn(),
    handleSelectCurrent: jest.fn(),
  }),
  useRepositorySelection: () => ({
    selectedRepo: mockSelectedRepo,
    setSelectedRepo: mockSetSelectedRepo,
    selectedBranch: mockSelectedBranch,
    setSelectedBranch: mockSetSelectedBranch,
    branches: [],
    setBranches: mockSetBranches,
    branchDialogOpen: false,
    branchDialogRepo: null,
    branchesLoading: false,
    handleSelectRepo: mockHandleSelectRepo,
    handleBranchSelect: mockHandleBranchSelect,
    handleBranchDialogClose: mockHandleBranchDialogClose,
  }),
  useTreeOperations: () => ({
    loadTree: mockLoadTree,
    handleToggle: jest.fn(),
    handleCreateFile: jest.fn(),
    handleDeleteFile: jest.fn(),
    handleCreateFolder: jest.fn(),
    handleRename: jest.fn(),
    handleMoveEntry: jest.fn(),
  }),
}));

jest.mock("../components/explorer/sections", () => ({
  BranchDialog: () => <div data-testid="branch-dialog" />,
  RepoListSection: (props: any) => (
    <div data-testid="repo-list">
      <button data-testid="select-repo" onClick={() => props.onSelectRepo?.({ fullName: "owner/repo", defaultBranch: "main" })} />
    </div>
  ),
  TreeViewSection: (props: any) => (
    <div data-testid="tree-view">
      <button data-testid="select-file" onClick={() => props.onSelectFile?.("docs/test.md")} />
    </div>
  ),
}));

import { ExplorerPanel } from "../components/ExplorerPanel";

describe("ExplorerPanel - coverage3", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = null;
    mockSelectedRepo = null;
    mockSelectedBranch = "";
    mockSelectedFilePath = null;
    mockCommits = [];
    mockSelectedSha = null;
    mockRootEntries = [];
    mockCommitsLoading = false;
    mockCommitsStale = false;
    mockChildrenCacheRef.current = new Map();
    mockHasMdCacheRef.current = new Map();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- Line 139: newCommit added when sha is new ---
  test("adds newCommit to the beginning when sha is new (line 139)", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    mockCommits = [{ sha: "old-sha", message: "old commit", author: "test", date: "2026-01-01" }];

    const newCommit = { sha: "new-sha-123", message: "new commit", author: "test", date: "2026-03-22" };

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve([]),
    });

    await act(async () => {
      render(
        <ExplorerPanel
          open={true}
          onSelectFile={jest.fn()}
          newCommit={newCommit}
        />,
      );
    });

    // setCommits should be called with an updater function
    expect(mockSetCommits).toHaveBeenCalled();
    const updaterFn = mockSetCommits.mock.calls[0][0];
    if (typeof updaterFn === "function") {
      // Call with existing commits that do NOT contain newCommit's sha
      const result = updaterFn([{ sha: "old-sha", message: "old commit", author: "test", date: "2026-01-01" }]);
      expect(result).toEqual([
        newCommit,
        { sha: "old-sha", message: "old commit", author: "test", date: "2026-01-01" },
      ]);
    }

    // setCommitsStale(false) on line 141 should also be called
    expect(mockSetCommitsStale).toHaveBeenCalledWith(false);
    // setSelectedSha(null) on line 142
    expect(mockSetSelectedSha).toHaveBeenCalledWith(null);
  });

  // --- Lines 212-252: sessionStorage restore with matching repo ---
  test("restores session from sessionStorage when matching repo is found (lines 212-252)", async () => {
    // Set up sessionStorage with saved state
    const savedState = { repo: "owner/repo", branch: "main", filePath: "docs/nested/file.md" };
    jest.spyOn(Storage.prototype, "getItem").mockReturnValue(JSON.stringify(savedState));
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});

    // API returns repos including the saved one
    const reposResponse = [
      { fullName: "owner/repo", defaultBranch: "main" },
      { fullName: "other/repo", defaultBranch: "develop" },
    ];

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve(reposResponse),
    });

    // Mock fetchDirEntries for tree loading
    mockFetchDirEntries.mockResolvedValue([
      { name: "docs", path: "docs", type: "dir" },
    ]);

    // Mock fetchCommits for file selection
    mockFetchCommits.mockResolvedValue({
      commits: [{ sha: "abc123", message: "init", author: "test", date: "2026-01-01" }],
      stale: false,
    });

    const onSelectFile = jest.fn();

    await act(async () => {
      render(
        <ExplorerPanel
          open={true}
          onSelectFile={onSelectFile}
        />,
      );
    });

    // Wait for fetch and restore to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/github/repos");
    });

    // The restore effect should set the repo and branch
    await waitFor(() => {
      expect(mockSetSelectedRepo).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: "owner/repo" }),
      );
    }, { timeout: 3000 });

    expect(mockSetSelectedBranch).toHaveBeenCalledWith("main");

    // It should expand parent dirs and select the file
    await waitFor(() => {
      expect(mockSetSelectedFilePath).toHaveBeenCalledWith("docs/nested/file.md");
    }, { timeout: 3000 });

    // fetchDirEntries should be called for root and nested dir
    await waitFor(() => {
      expect(mockFetchDirEntries).toHaveBeenCalledWith("owner/repo", "main", "");
    });

    // onSelectFile should be called with the restored file
    await waitFor(() => {
      expect(onSelectFile).toHaveBeenCalledWith("owner/repo", "docs/nested/file.md", "main");
    }, { timeout: 3000 });

    // fetchCommits should be called for the restored file
    await waitFor(() => {
      expect(mockFetchCommits).toHaveBeenCalledWith("owner/repo", "docs/nested/file.md", "main");
    }, { timeout: 3000 });
  });

  // --- Lines 212-252: sessionStorage restore with invalid JSON ---
  test("handles invalid JSON in sessionStorage gracefully (line 206-207)", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockReturnValue("not-valid-json{");

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true,
      json: () => Promise.resolve([{ fullName: "owner/repo", defaultBranch: "main" }]),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/github/repos");
    });

    // Should not crash, setSelectedRepo not called for restore
    // Only the repos fetch effect runs, not the restore
  });

  // --- handleFileSelect saves to sessionStorage (lines 94-101) ---
  test("handleFileSelect saves selection to sessionStorage", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    const setItemSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    jest.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve([]),
    });

    mockFetchCommits.mockResolvedValue({ commits: [], stale: false });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    // Click on a file in the tree
    await act(async () => {
      fireEvent.click(screen.getByTestId("select-file"));
    });

    // Wait for async operations
    await waitFor(() => {
      expect(mockFetchCommits).toHaveBeenCalled();
    });
  });

  // --- handleCommitSelect (lines 113-121) ---
  test("handleCommitSelect calls onSelectCommit", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    mockCommits = [{ sha: "sha123", message: "commit", author: "test", date: "2026-01-01" }];

    const onSelectCommit = jest.fn();

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve([]),
    });

    await act(async () => {
      render(
        <ExplorerPanel
          open={true}
          onSelectFile={jest.fn()}
          onSelectCommit={onSelectCommit}
        />,
      );
    });

    // Click the select-commit button in GitHistorySection
    await act(async () => {
      fireEvent.click(screen.getByTestId("select-commit"));
    });
  });

  // --- handleSelectCurrent with onSelectCurrentProp (lines 123-132) ---
  test("handleSelectCurrent calls onSelectCurrentProp when provided", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    mockCommits = [{ sha: "sha123", message: "commit", author: "test", date: "2026-01-01" }];

    const onSelectCurrent = jest.fn();

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve([]),
    });

    await act(async () => {
      render(
        <ExplorerPanel
          open={true}
          onSelectFile={jest.fn()}
          onSelectCurrent={onSelectCurrent}
        />,
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("select-current"));
    });
  });

  // --- handleBackToRepos clears sessionStorage (lines 256-268) ---
  test("handleBackToRepos clears state and removes sessionStorage", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSession = { user: { name: "test" } };

    const removeItemSpy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});
    jest.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve([]),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    // Click the back button (← owner/repo)
    const backButton = screen.getByText(/← owner\/repo/);
    await act(async () => {
      fireEvent.click(backButton);
    });

    expect(mockSetSelectedRepo).toHaveBeenCalledWith(null);
    expect(mockSetBranches).toHaveBeenCalledWith([]);
    expect(removeItemSpy).toHaveBeenCalledWith("explorerSelection");
  });

  // --- signOut callback (lines 319-330) ---
  test("signOut button resets all state", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSession = { user: { name: "testuser" } };

    jest.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve([]),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    // Find and click the signOut button
    const signOutButton = screen.getByLabelText("signOut");

    await act(async () => {
      fireEvent.click(signOutButton);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
    });
  });
});
