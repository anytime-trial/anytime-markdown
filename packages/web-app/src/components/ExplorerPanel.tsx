"use client";

import AccountTreeIcon from "@mui/icons-material/AccountTree";
import LogoutIcon from "@mui/icons-material/Logout";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { type FC, useCallback, useEffect, useRef, useState } from "react";

import { GitHistorySection } from "./explorer/GitHistorySection";
import { fetchCommits, fetchDirEntries } from "./explorer/helpers";
import { useFileSelection, useRepositorySelection, useTreeOperations, useTreeState } from "./explorer/hooks";
import { BranchDialog, RepoListSection, TreeViewSection } from "./explorer/sections";
import type { ExplorerPanelProps, GitHubRepo } from "./explorer/types";
import { PANEL_HEADER_MIN_HEIGHT, PANEL_WIDTH } from "./explorer/types";

export const ExplorerPanel: FC<ExplorerPanelProps> = ({
  open,
  width = PANEL_WIDTH,
  onSelectFile,
  onSelectCommit,
  onSelectCurrent: onSelectCurrentProp,
  isDirty,
  newCommit,
}) => {
  const t = useTranslations("Common");
  const { data: session } = useSession();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Tree state
  const treeState = useTreeState();
  const {
    rootEntries, setRootEntries,
    expanded, setExpanded,
    loadingDirs, setLoadingDirs,
    renamingPath, setRenamingPath,
    creatingInDir, setCreatingInDir,
    creatingFolderInDir, setCreatingFolderInDir,
    dragOverPath, setDragOverPath,
    dragSourceRef,
    childrenCacheRef, hasMdCacheRef,
    cacheVersion, bumpCache,
  } = treeState;

  // File selection
  const fileSelection = useFileSelection({
    selectedRepo: null as GitHubRepo | null, // will be updated below
    selectedBranch: "",
    onSelectFile,
    onSelectCommit,
    onSelectCurrentProp,
    newCommit,
  });

  // We need a pattern where hooks can reference each other's state.
  // Since hooks can't be called conditionally, we use a ref-based approach.
  // The actual wiring happens through the useTreeOperations and useRepositorySelection hooks.

  const {
    selectedFilePath, setSelectedFilePath,
    commits, setCommits,
    commitsLoading, setCommitsLoading,
    selectedSha, setSelectedSha,
    commitsStale, setCommitsStale,
    handleFileSelect: _handleFileSelect,
    handleCommitSelect: _handleCommitSelect,
    handleSelectCurrent: _handleSelectCurrent,
  } = fileSelection;

  // We need to rebuild handleFileSelect etc. with the correct selectedRepo/selectedBranch.
  // Since useFileSelection was initialized with null, we manage these callbacks directly.
  // The hooks provide the state; we rebuild the callbacks that depend on cross-hook state.

  // Tree operations (depends on repo selection, so we forward-declare)
  const repoSelectionRef = useRef<{ selectedRepo: GitHubRepo | null; selectedBranch: string }>({ selectedRepo: null, selectedBranch: "" });

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      const { selectedRepo, selectedBranch } = repoSelectionRef.current;
      if (!selectedRepo) return;
      setSelectedFilePath(filePath);
      setSelectedSha(null);
      onSelectFile(selectedRepo.fullName, filePath, selectedBranch);

      // 選択状態を sessionStorage に保存
      try {
        sessionStorage.setItem("explorerSelection", JSON.stringify({
          repo: selectedRepo.fullName,
          branch: selectedBranch,
          filePath,
        }));
      } catch { /* ignore */ }

      // コミット履歴を取得
      setCommitsLoading(true);
      const { commits: commitList, stale } = await fetchCommits(selectedRepo.fullName, filePath, selectedBranch);
      setCommits(commitList);
      setCommitsStale(stale);
      setCommitsLoading(false);
    },
    [onSelectFile, setSelectedFilePath, setSelectedSha, setCommitsLoading, setCommits, setCommitsStale],
  );

  const handleCommitSelect = useCallback(
    (sha: string) => {
      const { selectedRepo } = repoSelectionRef.current;
      if (!selectedRepo || !selectedFilePath) return;
      setSelectedSha(sha);
      onSelectCommit?.(selectedRepo.fullName, selectedFilePath, sha);
    },
    [selectedFilePath, onSelectCommit, setSelectedSha],
  );

  const handleSelectCurrent = useCallback(() => {
    const { selectedRepo, selectedBranch } = repoSelectionRef.current;
    if (!selectedRepo || !selectedFilePath) return;
    setSelectedSha(null);
    if (onSelectCurrentProp) {
      onSelectCurrentProp();
    } else {
      onSelectFile(selectedRepo.fullName, selectedFilePath, selectedBranch);
    }
  }, [selectedFilePath, onSelectFile, onSelectCurrentProp, setSelectedSha]);

  // 新しいコミットをリストの先頭に追加
  useEffect(() => {
    if (!newCommit) return;
    setCommits((prev) => {
      if (prev.some((c) => c.sha === newCommit.sha)) return prev;
      return [newCommit, ...prev];
    });
    setCommitsStale(false);
    setSelectedSha(null);
  }, [newCommit, setCommits, setCommitsStale, setSelectedSha]);

  const treeOps = useTreeOperations({
    selectedRepo: repoSelectionRef.current.selectedRepo,
    selectedBranch: repoSelectionRef.current.selectedBranch,
    selectedFilePath,
    setSelectedFilePath,
    setCommits: setCommits as unknown as (commits: []) => void,
    setSelectedSha,
    rootEntries,
    setRootEntries,
    expanded,
    setExpanded,
    setLoadingDirs,
    setCreatingInDir,
    setCreatingFolderInDir,
    setRenamingPath,
    childrenCacheRef,
    hasMdCacheRef,
    bumpCache,
    handleFileSelect,
  });

  const { loadTree, handleToggle, handleCreateFile, handleDeleteFile, handleCreateFolder, handleRename, handleMoveEntry } = treeOps;

  const repoSelection = useRepositorySelection({ loadTree });
  const {
    selectedRepo, setSelectedRepo,
    selectedBranch, setSelectedBranch,
    branches, setBranches,
    branchDialogOpen, branchDialogRepo, branchesLoading,
    handleSelectRepo, handleBranchSelect, handleBranchDialogClose,
  } = repoSelection;

  // Keep the ref in sync
  repoSelectionRef.current = { selectedRepo, selectedBranch };

  // Fetch repos on first open
  useEffect(() => {
    if (!open || repos.length > 0 || needsAuth) return;
    setLoading(true);
    fetch("/api/github/repos")
      .then((res) => {
        if (res.status === 401) {
          setNeedsAuth(true);
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setRepos(data);
      })
      .catch(() => setNeedsAuth(true))
      .finally(() => setLoading(false));
  }, [open, repos.length, needsAuth]);

  // リポジトリ取得後、sessionStorage から前回の選択状態を復元
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || repos.length === 0 || selectedRepo) return;
    let saved: { repo: string; branch: string; filePath: string } | null = null;
    try {
      const raw = sessionStorage.getItem("explorerSelection");
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!saved) return;
    const savedState = saved;
    const repo = repos.find((r) => r.fullName === savedState.repo);
    if (!repo) return;
    restoredRef.current = true;
    // リポジトリ→ブランチ→ツリー→ファイル選択を自動実行
    (async () => {
      setSelectedRepo(repo);
      setSelectedBranch(savedState.branch);
      setExpanded(new Set());
      setSelectedFilePath(null);
      setCommits([]);
      setSelectedSha(null);
      childrenCacheRef.current = new Map();
      hasMdCacheRef.current = new Map();
      setLoading(true);
      const entries = await fetchDirEntries(repo.fullName, savedState.branch, "");
      childrenCacheRef.current.set("", entries);
      setRootEntries(entries);
      setLoading(false);

      // ファイルパスの親ディレクトリを展開
      const parts = savedState.filePath.split("/");
      const dirsToExpand: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        dirsToExpand.push(parts.slice(0, i).join("/"));
      }
      for (const dir of dirsToExpand) {
        if (!childrenCacheRef.current.has(dir)) {
          const children = await fetchDirEntries(repo.fullName, savedState.branch, dir);
          childrenCacheRef.current.set(dir, children);
          bumpCache();
        }
      }
      setExpanded(new Set(dirsToExpand));

      // ファイル選択を実行
      setSelectedFilePath(savedState.filePath);
      setSelectedSha(null);
      onSelectFile(repo.fullName, savedState.filePath, savedState.branch);
      setCommitsLoading(true);
      const { commits: commitList, stale } = await fetchCommits(repo.fullName, savedState.filePath, savedState.branch);
      setCommits(commitList);
      setCommitsStale(stale);
      setCommitsLoading(false);
    })();
  }, [repos, selectedRepo, onSelectFile, bumpCache, setSelectedRepo, setSelectedBranch, setExpanded, setSelectedFilePath, setCommits, setSelectedSha, childrenCacheRef, hasMdCacheRef, setRootEntries, setCommitsLoading, setCommitsStale]);

  const handleBackToRepos = useCallback(() => {
    setSelectedRepo(null);
    setBranches([]);
    setSelectedBranch("");
    setRootEntries([]);
    setExpanded(new Set());
    setSelectedFilePath(null);
    setCommits([]);
    setSelectedSha(null);
    childrenCacheRef.current = new Map();
    hasMdCacheRef.current = new Map();
    try { sessionStorage.removeItem("explorerSelection"); } catch { /* ignore */ }
  }, [setSelectedRepo, setBranches, setSelectedBranch, setRootEntries, setExpanded, setSelectedFilePath, setCommits, setSelectedSha, childrenCacheRef, hasMdCacheRef]);

  if (!open) return null;

  // cacheVersion is read here to trigger re-renders when cache is bumped
  const _cacheVersion = cacheVersion;  

  return (
    <Box
      sx={{
        width,
        minWidth: width,
        borderLeft: 1,
        borderTop: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* === Upper: Explorer === */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          minHeight: PANEL_HEADER_MIN_HEIGHT,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {selectedRepo ? (
          <Button
            size="small"
            onClick={handleBackToRepos}
            sx={{ minWidth: 0, textTransform: "none", fontSize: "0.75rem", flex: 1, justifyContent: "flex-start" }}
          >
            ← {selectedRepo.fullName}
          </Button>
        ) : (
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            {t("explorer")}
          </Typography>
        )}
        {session && (
          <Tooltip title={t("signOut")}>
            <IconButton
              size="small"
              onClick={() => {
                signOut({ redirect: false }).then(() => {
                  setRepos([]);
                  setSelectedRepo(null);
                  setRootEntries([]);
                  setExpanded(new Set());
                  setSelectedFilePath(null);
                  setCommits([]);
                  setSelectedSha(null);
                  setNeedsAuth(true);
                  childrenCacheRef.current = new Map();
                  hasMdCacheRef.current = new Map();
                });
              }}
              sx={{ p: 0.5 }}
            >
              <LogoutIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {selectedRepo && selectedBranch && (
        <Box sx={{ px: 1, py: 0.25 }}>
          <Button
            size="small"
            startIcon={<AccountTreeIcon sx={{ fontSize: 14 }} />}
            onClick={() => handleSelectRepo(selectedRepo)}
            sx={{
              textTransform: "none",
              fontSize: "0.7rem",
              py: 0,
              px: 0.5,
              minHeight: 24,
              color: "text.secondary",
              justifyContent: "flex-start",
            }}
          >
            {selectedBranch}
          </Button>
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {!selectedRepo ? (
          <RepoListSection
            needsAuth={needsAuth}
            loading={loading}
            repos={repos}
            onSelectRepo={handleSelectRepo}
          />
        ) : (
          <TreeViewSection
            repo={selectedRepo}
            rootEntries={rootEntries}
            expanded={expanded}
            loadingDirs={loadingDirs}
            childrenCache={childrenCacheRef.current}
            hasMdCache={hasMdCacheRef.current}
            selectedFilePath={selectedFilePath}
            onToggle={handleToggle}
            onSelectFile={handleFileSelect}
            onCreateFile={handleCreateFile}
            onDeleteFile={handleDeleteFile}
            onRename={handleRename}
            onCreateFolder={handleCreateFolder}
            renamingPath={renamingPath}
            onStartRename={setRenamingPath}
            onCancelRename={() => setRenamingPath(null)}
            creatingInDir={creatingInDir}
            onStartCreate={setCreatingInDir}
            onCancelCreate={() => setCreatingInDir(null)}
            creatingFolderInDir={creatingFolderInDir}
            onStartCreateFolder={setCreatingFolderInDir}
            onCancelCreateFolder={() => setCreatingFolderInDir(null)}
            dragOverPath={dragOverPath}
            onMoveEntry={handleMoveEntry}
            onDragOverPath={setDragOverPath}
            dragSourceRef={dragSourceRef}
          />
        )}
      </Box>

      {/* === Lower: Git History === */}
      {selectedFilePath && (
        <>
          <Divider />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1,
              py: 0.5,
              minHeight: 32,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, px: 0.5 }}>
              {t("gitHistory")}
            </Typography>
            <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary", fontSize: "0.65rem", flex: 1 }} noWrap>
              {selectedFilePath.split("/").pop()}
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflow: "auto", minHeight: 100, maxHeight: "40%" }}>
            <GitHistorySection
              commits={commits}
              loading={commitsLoading}
              selectedSha={selectedSha}
              onSelectCommit={handleCommitSelect}
              isDirty={isDirty}
              onSelectCurrent={handleSelectCurrent}
              stale={commitsStale}
            />
          </Box>
        </>
      )}

      {/* === Branch selection dialog === */}
      <BranchDialog
        open={branchDialogOpen}
        onClose={handleBranchDialogClose}
        repo={branchDialogRepo}
        branches={branches}
        loading={branchesLoading}
        onSelectBranch={handleBranchSelect}
      />
    </Box>
  );
};
