import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn().mockResolvedValue(undefined),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// Mock all explorer sub-modules
jest.mock("../components/explorer/GitHistorySection", () => ({
  GitHistorySection: () => <div data-testid="git-history" />,
}));

jest.mock("../components/explorer/helpers", () => ({
  fetchCommits: jest.fn().mockResolvedValue({ commits: [], stale: false }),
  fetchDirEntries: jest.fn().mockResolvedValue([]),
}));

jest.mock("../components/explorer/hooks", () => ({
  useTreeState: () => ({
    rootEntries: [],
    setRootEntries: jest.fn(),
    expanded: new Set(),
    setExpanded: jest.fn(),
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
    childrenCacheRef: { current: new Map() },
    hasMdCacheRef: { current: new Map() },
    cacheVersion: 0,
    bumpCache: jest.fn(),
  }),
  useFileSelection: () => ({
    selectedFilePath: null,
    setSelectedFilePath: jest.fn(),
    commits: [],
    setCommits: jest.fn(),
    commitsLoading: false,
    setCommitsLoading: jest.fn(),
    selectedSha: null,
    setSelectedSha: jest.fn(),
    commitsStale: false,
    setCommitsStale: jest.fn(),
    handleFileSelect: jest.fn(),
    handleCommitSelect: jest.fn(),
    handleSelectCurrent: jest.fn(),
  }),
  useRepositorySelection: () => ({
    selectedRepo: null,
    setSelectedRepo: jest.fn(),
    selectedBranch: "",
    setSelectedBranch: jest.fn(),
    branches: [],
    setBranches: jest.fn(),
    branchDialogOpen: false,
    branchDialogRepo: null,
    branchesLoading: false,
    handleSelectRepo: jest.fn(),
    handleBranchSelect: jest.fn(),
    handleBranchDialogClose: jest.fn(),
  }),
  useTreeOperations: () => ({
    loadTree: jest.fn(),
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
  RepoListSection: () => <div data-testid="repo-list" />,
  TreeViewSection: () => <div data-testid="tree-view" />,
}));

import { ExplorerPanel } from "../components/ExplorerPanel";

describe("ExplorerPanel", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns null when not open", () => {
    const { container } = render(
      <ExplorerPanel open={false} onSelectFile={jest.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders explorer title when open and no repo selected", () => {
    render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    expect(screen.getByText("explorer")).toBeTruthy();
  });

  it("renders repo list section when no repo selected", () => {
    render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    expect(screen.getByTestId("repo-list")).toBeTruthy();
  });

  it("renders branch dialog", () => {
    render(<ExplorerPanel open={true} onSelectFile={jest.fn()} />);
    expect(screen.getByTestId("branch-dialog")).toBeTruthy();
  });
});
