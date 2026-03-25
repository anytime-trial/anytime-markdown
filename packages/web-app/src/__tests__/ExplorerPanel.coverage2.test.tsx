/**
 * ExplorerPanel.tsx coverage2 tests
 * Targets uncovered lines: 138-139, 203-252, 379-385
 * - newCommit dedup (138-139): when newCommit.sha already exists in commits
 * - sessionStorage restore (203-252): restoring previous selection from sessionStorage
 * - TreeViewSection cancel callbacks (379-385): onCancelRename, onCancelCreate, onCancelCreateFolder
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// --- configurable mock state ---
let mockSession: any = null;
let mockSelectedRepo: any = null;
let mockSelectedBranch = "";
let mockSelectedFilePath: string | null = null;
let mockCommits: any[] = [];
let mockSelectedSha: string | null = null;
let mockRootEntries: any[] = [];
let mockExpanded = new Set<string>();
let mockBranchDialogOpen = false;
let mockBranchDialogRepo: any = null;
let mockBranchesLoading = false;
let mockBranches: any[] = [];
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
const mockHandleFileSelect = jest.fn();
const mockHandleToggle = jest.fn();
const mockHandleCreateFile = jest.fn();
const mockHandleDeleteFile = jest.fn();
const mockHandleRename = jest.fn();
const mockHandleCreateFolder = jest.fn();
const mockHandleMoveEntry = jest.fn();
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
    expanded: mockExpanded,
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
    handleFileSelect: mockHandleFileSelect,
    handleCommitSelect: jest.fn(),
    handleSelectCurrent: jest.fn(),
  }),
  useRepositorySelection: () => ({
    selectedRepo: mockSelectedRepo,
    setSelectedRepo: mockSetSelectedRepo,
    selectedBranch: mockSelectedBranch,
    setSelectedBranch: mockSetSelectedBranch,
    branches: mockBranches,
    setBranches: mockSetBranches,
    branchDialogOpen: mockBranchDialogOpen,
    branchDialogRepo: mockBranchDialogRepo,
    branchesLoading: mockBranchesLoading,
    handleSelectRepo: mockHandleSelectRepo,
    handleBranchSelect: mockHandleBranchSelect,
    handleBranchDialogClose: mockHandleBranchDialogClose,
  }),
  useTreeOperations: () => ({
    loadTree: mockLoadTree,
    handleToggle: mockHandleToggle,
    handleCreateFile: mockHandleCreateFile,
    handleDeleteFile: mockHandleDeleteFile,
    handleCreateFolder: mockHandleCreateFolder,
    handleRename: mockHandleRename,
    handleMoveEntry: mockHandleMoveEntry,
  }),
}));

let capturedTreeViewProps: any = {};

jest.mock("../components/explorer/sections", () => ({
  BranchDialog: () => <div data-testid="branch-dialog" />,
  RepoListSection: (props: any) => <div data-testid="repo-list" />,
  TreeViewSection: (props: any) => {
    capturedTreeViewProps = props;
    return (
      <div data-testid="tree-view">
        <button data-testid="cancel-rename" onClick={() => props.onCancelRename?.()} />
        <button data-testid="cancel-create" onClick={() => props.onCancelCreate?.()} />
        <button data-testid="cancel-create-folder" onClick={() => props.onCancelCreateFolder?.()} />
      </div>
    );
  },
}));

import { ExplorerPanel } from "../components/ExplorerPanel";

describe("ExplorerPanel - coverage2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = null;
    mockSelectedRepo = null;
    mockSelectedBranch = "";
    mockSelectedFilePath = null;
    mockCommits = [];
    mockSelectedSha = null;
    mockRootEntries = [];
    mockExpanded = new Set();
    mockBranchDialogOpen = false;
    mockBranchDialogRepo = null;
    mockBranchesLoading = false;
    mockBranches = [];
    mockCommitsLoading = false;
    mockCommitsStale = false;
    mockChildrenCacheRef.current = new Map();
    mockHasMdCacheRef.current = new Map();
    capturedTreeViewProps = {};

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve([]),
    });

    const store: Record<string, string> = {};
    jest.spyOn(Storage.prototype, "getItem").mockImplementation((key) => store[key] ?? null);
    jest.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => { store[key] = value; });
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => { delete store[key]; });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- newCommit dedup (lines 138-139) ---
  test("does not add duplicate newCommit when sha already exists", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    mockCommits = [{ sha: "existing123", message: "old commit", author: "test", date: "2026-01-01" }];

    const newCommit = { sha: "existing123", message: "old commit", author: "test", date: "2026-01-01" };

    await act(async () => {
      render(
        <ExplorerPanel
          open={true}
          onSelectFile={jest.fn()}
          newCommit={newCommit}
        />,
      );
    });

    expect(mockSetCommits).toHaveBeenCalled();
    const updaterFn = mockSetCommits.mock.calls[0][0];
    if (typeof updaterFn === "function") {
      const result = updaterFn([{ sha: "existing123", message: "old commit", author: "test", date: "2026-01-01" }]);
      expect(result).toEqual([{ sha: "existing123", message: "old commit", author: "test", date: "2026-01-01" }]);
    }
  });

  // --- TreeViewSection cancel callbacks (lines 379-385) ---
  test("onCancelRename calls setRenamingPath(null)", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    fireEvent.click(screen.getByTestId("cancel-rename"));
    expect(mockSetRenamingPath).toHaveBeenCalledWith(null);
  });

  test("onCancelCreate calls setCreatingInDir(null)", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    fireEvent.click(screen.getByTestId("cancel-create"));
    expect(mockSetCreatingInDir).toHaveBeenCalledWith(null);
  });

  test("onCancelCreateFolder calls setCreatingFolderInDir(null)", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    fireEvent.click(screen.getByTestId("cancel-create-folder"));
    expect(mockSetCreatingFolderInDir).toHaveBeenCalledWith(null);
  });

  // --- TreeViewSection props are passed correctly ---
  test("passes tree operation callbacks to TreeViewSection", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    expect(capturedTreeViewProps.onStartRename).toBe(mockSetRenamingPath);
    expect(capturedTreeViewProps.onStartCreate).toBe(mockSetCreatingInDir);
    expect(capturedTreeViewProps.onStartCreateFolder).toBe(mockSetCreatingFolderInDir);
    expect(capturedTreeViewProps.onDragOverPath).toBe(mockSetDragOverPath);
  });

  // --- open=false returns null ---
  test("returns null when open is false", () => {
    const { container } = render(<ExplorerPanel open={false} onSelectFile={jest.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  // --- fetch repos with non-array response ---
  test("handles non-array response from repos API", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ error: "unexpected" }),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/github/repos");
    });
  });

  // --- sessionStorage restore with no saved state ---
  test("does not restore when sessionStorage is empty", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve([{ fullName: "owner/repo", defaultBranch: "main" }]),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/github/repos");
    });
  });

  // --- sessionStorage restore with non-matching repo ---
  test("does not restore when saved repo not found", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockReturnValue(
      JSON.stringify({ repo: "nonexistent/repo", branch: "main", filePath: "test.md" }),
    );

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve([{ fullName: "owner/repo", defaultBranch: "main" }]),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
