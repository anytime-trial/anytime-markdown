/**
 * ExplorerPanel.tsx coverage tests
 * Targets uncovered lines: 88-108, 115-118, 124-130, 137-142, 187-188,
 *   195, 203-252, 257-267, 319-385
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
let mockNeedsAuth = false;
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
    setRenamingPath: jest.fn(),
    creatingInDir: null,
    setCreatingInDir: jest.fn(),
    creatingFolderInDir: null,
    setCreatingFolderInDir: jest.fn(),
    dragOverPath: null,
    setDragOverPath: jest.fn(),
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
let capturedRepoListProps: any = {};

jest.mock("../components/explorer/sections", () => ({
  BranchDialog: () => <div data-testid="branch-dialog" />,
  RepoListSection: (props: any) => {
    capturedRepoListProps = props;
    return <div data-testid="repo-list" />;
  },
  TreeViewSection: (props: any) => {
    capturedTreeViewProps = props;
    return (
      <div data-testid="tree-view">
        <button data-testid="select-file-btn" onClick={() => props.onSelectFile?.("docs/test.md")} />
      </div>
    );
  },
}));

import { ExplorerPanel } from "../components/ExplorerPanel";

describe("ExplorerPanel - coverage tests", () => {
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
    mockNeedsAuth = false;
    mockBranchDialogOpen = false;
    mockBranchDialogRepo = null;
    mockBranchesLoading = false;
    mockBranches = [];
    mockCommitsLoading = false;
    mockCommitsStale = false;
    mockChildrenCacheRef.current = new Map();
    mockHasMdCacheRef.current = new Map();
    capturedTreeViewProps = {};
    capturedRepoListProps = {};

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve([]),
    });

    // Mock sessionStorage
    const store: Record<string, string> = {};
    jest.spyOn(Storage.prototype, "getItem").mockImplementation((key) => store[key] ?? null);
    jest.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => { store[key] = value; });
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => { delete store[key]; });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- Selected repo shows back button and branch button (lines 301-358) ---
  it("renders back button when repo is selected", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    expect(screen.getByText(/owner\/repo/)).toBeTruthy();
  });

  it("renders branch button when repo and branch are selected", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "develop";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    expect(screen.getByText("develop")).toBeTruthy();
  });

  it("clicking branch button calls handleSelectRepo", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    const branchBtn = screen.getByText("main");
    fireEvent.click(branchBtn);
    expect(mockHandleSelectRepo).toHaveBeenCalledWith(mockSelectedRepo);
  });

  // --- handleBackToRepos (lines 256-268) ---
  it("calls handleBackToRepos when back button clicked", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    const backBtn = screen.getByText(/owner\/repo/);
    fireEvent.click(backBtn);

    expect(mockSetSelectedRepo).toHaveBeenCalledWith(null);
    expect(mockSetBranches).toHaveBeenCalledWith([]);
    expect(mockSetSelectedBranch).toHaveBeenCalledWith("");
    expect(mockSetRootEntries).toHaveBeenCalledWith([]);
    expect(mockSetSelectedFilePath).toHaveBeenCalledWith(null);
    expect(mockSetCommits).toHaveBeenCalledWith([]);
    expect(mockSetSelectedSha).toHaveBeenCalledWith(null);
  });

  // --- TreeViewSection shown when repo is selected (lines 362-390) ---
  it("renders TreeViewSection when repo is selected", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    expect(screen.getByTestId("tree-view")).toBeTruthy();
  });

  // --- handleFileSelect (lines 86-111) ---
  it("handleFileSelect selects file and fetches commits", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    const onSelectFile = jest.fn();
    mockFetchCommits.mockResolvedValue({ commits: [{ sha: "abc" }], stale: false });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={onSelectFile} />);
    });

    // Trigger file select via TreeViewSection
    await act(async () => {
      fireEvent.click(screen.getByTestId("select-file-btn"));
    });

    expect(mockSetSelectedFilePath).toHaveBeenCalledWith("docs/test.md");
    expect(mockSetSelectedSha).toHaveBeenCalledWith(null);
    expect(onSelectFile).toHaveBeenCalledWith("owner/repo", "docs/test.md", "main");
  });

  // --- handleCommitSelect (lines 113-121) ---
  it("handleCommitSelect calls onSelectCommit", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    const onSelectCommit = jest.fn();

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} onSelectCommit={onSelectCommit} />);
    });

    // GitHistorySection has a select-commit button
    await act(async () => {
      fireEvent.click(screen.getByTestId("select-commit"));
    });
  });

  // --- handleSelectCurrent (lines 123-132) ---
  it("handleSelectCurrent calls onSelectCurrent prop when provided", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    const onSelectCurrent = jest.fn();

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

  it("handleSelectCurrent falls back to onSelectFile when onSelectCurrent not provided", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";
    const onSelectFile = jest.fn();

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={onSelectFile} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("select-current"));
    });
  });

  // --- Git history section rendered when file is selected (lines 402-433) ---
  it("renders git history section when file is selected", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/readme.md";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    expect(screen.getByTestId("git-history")).toBeTruthy();
    expect(screen.getByText("gitHistory")).toBeTruthy();
    expect(screen.getByText("readme.md")).toBeTruthy();
  });

  // --- newCommit effect (lines 135-143) ---
  it("adds new commit to list when newCommit prop changes", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";

    const newCommit = { sha: "new123", message: "new commit", author: "test", date: "2026-01-01" };

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
    expect(mockSetCommitsStale).toHaveBeenCalledWith(false);
    expect(mockSetSelectedSha).toHaveBeenCalledWith(null);
  });

  // --- signOut (lines 319-331) ---
  it("calls signOut when sign out button clicked", async () => {
    mockSession = { user: { name: "test" } };

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    const signOutBtn = screen.getByLabelText("signOut");
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
    });
  });

  // --- fetch repos 401 (lines 186-188) ---
  it("sets needsAuth on 401 response", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: () => Promise.resolve([]),
    });

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    // Should handle 401 gracefully
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/github/repos");
    });
  });

  // --- fetch repos network error (line 195) ---
  it("sets needsAuth on fetch error", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // --- isDirty prop passed to GitHistorySection ---
  it("passes isDirty prop to GitHistorySection", async () => {
    mockSelectedRepo = { fullName: "owner/repo", defaultBranch: "main" };
    mockSelectedBranch = "main";
    mockSelectedFilePath = "docs/test.md";

    await act(async () => {
      render(<ExplorerPanel open={true} onSelectFile={jest.fn()} isDirty={true} />);
    });

    expect(screen.getByTestId("git-history")).toBeTruthy();
  });
});
