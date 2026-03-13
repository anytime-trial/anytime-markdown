"use client";

import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LockIcon from "@mui/icons-material/Lock";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { signIn } from "next-auth/react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";

interface GitHubRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  name: string;
}

interface ExplorerPanelProps {
  open: boolean;
  width?: number;
  onSelectFile: (repo: string, filePath: string) => void;
}

const PANEL_WIDTH = 260;
const INDENT_PX = 16;

/** フォルダの子要素キャッシュ */
type ChildrenCache = Map<string, TreeEntry[]>;

/**
 * md ファイル有無キャッシュ
 * true = 配下に md あり, false = なし, undefined = 未確認
 */
type HasMdCache = Map<string, boolean>;

async function fetchDirEntries(
  repo: string,
  branch: string,
  dirPath: string,
): Promise<TreeEntry[]> {
  const res = await fetch(
    `/api/github/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(dirPath)}&ref=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return (data as { path: string; type: string; name: string }[])
    .map((item) => ({
      path: item.path,
      type: (item.type === "dir" ? "tree" : "blob") as "tree" | "blob",
      name: item.name,
    }))
    .filter(
      (e) =>
        e.type === "tree" ||
        e.name.endsWith(".md") ||
        e.name.endsWith(".markdown"),
    )
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** 再帰ツリーノード */
const TreeNode: FC<{
  entry: TreeEntry;
  depth: number;
  repo: GitHubRepo;
  expanded: Set<string>;
  loadingDirs: Set<string>;
  childrenCache: ChildrenCache;
  hasMdCache: HasMdCache;
  onToggle: (entry: TreeEntry) => void;
  onSelectFile: (path: string) => void;
}> = ({ entry, depth, repo, expanded, loadingDirs, childrenCache, hasMdCache, onToggle, onSelectFile }) => {
  const isDir = entry.type === "tree";
  const isOpen = expanded.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const children = childrenCache.get(entry.path);
  const hasMd = hasMdCache.get(entry.path);
  // hasMd === false → 配下に md なし（色を変えて展開不可）
  const empty = isDir && hasMd === false;
  const emptyColor = "text.disabled";

  return (
    <>
      <ListItemButton
        onClick={() => {
          if (isDir) { if (!empty) onToggle(entry); }
          else onSelectFile(entry.path);
        }}
        disabled={empty}
        sx={{
          py: 0.25,
          pl: 1 + depth * (INDENT_PX / 8),
          minHeight: 28,
          "&.Mui-disabled": { opacity: 1 },
        }}
      >
        {isDir && (
          <ListItemIcon sx={{ minWidth: 20 }}>
            {isLoading ? (
              <CircularProgress size={14} />
            ) : empty ? (
              <ChevronRightIcon sx={{ fontSize: 18, color: emptyColor }} />
            ) : isOpen ? (
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 18 }} />
            )}
          </ListItemIcon>
        )}
        {!isDir && <Box sx={{ width: 20 }} />}
        <ListItemIcon sx={{ minWidth: 24 }}>
          {isDir ? (
            isOpen ? (
              <FolderOpenIcon sx={{ fontSize: 18, color: empty ? emptyColor : undefined }} />
            ) : (
              <FolderIcon sx={{ fontSize: 18, color: empty ? emptyColor : undefined }} />
            )
          ) : (
            <InsertDriveFileIcon sx={{ fontSize: 18 }} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={entry.name}
          primaryTypographyProps={{
            variant: "body2",
            noWrap: true,
            fontSize: "0.8rem",
            color: empty ? emptyColor : undefined,
          }}
        />
      </ListItemButton>
      {isDir && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <List dense disablePadding>
            {children?.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                repo={repo}
                expanded={expanded}
                loadingDirs={loadingDirs}
                childrenCache={childrenCache}
                hasMdCache={hasMdCache}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
              />
            ))}
            {children?.length === 0 && (
              <Typography
                variant="caption"
                sx={{ pl: 2 + (depth + 1) * 2, py: 0.5, color: "text.secondary", display: "block" }}
              >
                Empty
              </Typography>
            )}
          </List>
        </Collapse>
      )}
    </>
  );
};

export const ExplorerPanel: FC<ExplorerPanelProps> = ({
  open,
  width = PANEL_WIDTH,
  onSelectFile,
}) => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [rootEntries, setRootEntries] = useState<TreeEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const childrenCacheRef = useRef<ChildrenCache>(new Map());
  const hasMdCacheRef = useRef<HasMdCache>(new Map());
  // re-render トリガー（キャッシュ更新を反映するため）
  const [cacheVersion, setCacheVersion] = useState(0);
  const bumpCache = useCallback(() => setCacheVersion((v) => v + 1), []);

  // バックグラウンドで再帰的にサブディレクトリを探索し hasMd を確定する
  const prefetchSubtree = useCallback(
    async (repo: GitHubRepo, dirPath: string): Promise<boolean> => {
      // 既にキャッシュ済みならそれを返す
      const cached = hasMdCacheRef.current.get(dirPath);
      if (cached !== undefined) return cached;

      let entries = childrenCacheRef.current.get(dirPath);
      if (!entries) {
        entries = await fetchDirEntries(repo.fullName, repo.defaultBranch, dirPath);
        childrenCacheRef.current.set(dirPath, entries);
      }

      // 直下に md ファイルがあれば true
      const hasDirectMd = entries.some((e) => e.type === "blob");
      if (hasDirectMd) {
        hasMdCacheRef.current.set(dirPath, true);
        bumpCache();
        // 子ディレクトリも並行して探索（結果更新のため）
        const subDirs = entries.filter((e) => e.type === "tree");
        await Promise.all(subDirs.map((d) => prefetchSubtree(repo, d.path)));
        return true;
      }

      // サブディレクトリを並行探索
      const subDirs = entries.filter((e) => e.type === "tree");
      if (subDirs.length === 0) {
        hasMdCacheRef.current.set(dirPath, false);
        bumpCache();
        return false;
      }

      const results = await Promise.all(
        subDirs.map((d) => prefetchSubtree(repo, d.path)),
      );
      const hasMd = results.some(Boolean);
      hasMdCacheRef.current.set(dirPath, hasMd);
      bumpCache();
      return hasMd;
    },
    [bumpCache],
  );

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

  const handleSelectRepo = useCallback(
    async (repo: GitHubRepo) => {
      setSelectedRepo(repo);
      setExpanded(new Set());
      childrenCacheRef.current = new Map();
      hasMdCacheRef.current = new Map();
      setLoading(true);
      const entries = await fetchDirEntries(repo.fullName, repo.defaultBranch, "");
      childrenCacheRef.current.set("", entries);
      setRootEntries(entries);
      setLoading(false);

      // バックグラウンドでサブディレクトリを再帰探索
      const subDirs = entries.filter((e) => e.type === "tree");
      subDirs.forEach((d) => prefetchSubtree(repo, d.path));
    },
    [prefetchSubtree],
  );

  const handleBackToRepos = useCallback(() => {
    setSelectedRepo(null);
    setRootEntries([]);
    setExpanded(new Set());
    childrenCacheRef.current = new Map();
    hasMdCacheRef.current = new Map();
  }, []);

  const handleToggle = useCallback(
    async (entry: TreeEntry) => {
      if (!selectedRepo) return;
      const path = entry.path;

      if (expanded.has(path)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }

      // Expand: fetch children if not cached
      if (!childrenCacheRef.current.has(path)) {
        setLoadingDirs((prev) => new Set(prev).add(path));
        const children = await fetchDirEntries(
          selectedRepo.fullName,
          selectedRepo.defaultBranch,
          path,
        );
        childrenCacheRef.current.set(path, children);
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        // 新たに取得した子ディレクトリをバックグラウンド探索
        const subDirs = children.filter((e) => e.type === "tree");
        subDirs.forEach((d) => prefetchSubtree(selectedRepo, d.path));
      }

      setExpanded((prev) => new Set(prev).add(path));
    },
    [selectedRepo, expanded, prefetchSubtree],
  );

  const handleFileSelect = useCallback(
    (filePath: string) => {
      if (selectedRepo) {
        onSelectFile(selectedRepo.fullName, filePath);
      }
    },
    [selectedRepo, onSelectFile],
  );

  if (!open) return null;

  // cacheVersion を参照して再描画を保証
  void cacheVersion;

  return (
    <Box
      sx={{
        width,
        minWidth: width,
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.5,
          minHeight: 36,
        }}
      >
        {selectedRepo ? (
          <Button
            size="small"
            onClick={handleBackToRepos}
            sx={{ minWidth: 0, textTransform: "none", fontSize: "0.75rem" }}
          >
            ← {selectedRepo.fullName}
          </Button>
        ) : (
          <Typography variant="caption" sx={{ fontWeight: 600, px: 0.5 }}>
            EXPLORER
          </Typography>
        )}
      </Box>
      <Divider />

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {needsAuth ? (
          <Box sx={{ textAlign: "center", py: 4, px: 2 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              GitHub authentication required
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => signIn("github")}
            >
              Sign in with GitHub
            </Button>
          </Box>
        ) : loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : !selectedRepo ? (
          <List dense disablePadding>
            {repos.map((repo) => (
              <ListItemButton
                key={repo.fullName}
                onClick={() => handleSelectRepo(repo)}
                sx={{ py: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  {repo.private ? (
                    <LockIcon fontSize="small" />
                  ) : (
                    <FolderIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={repo.fullName}
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                />
              </ListItemButton>
            ))}
            {repos.length === 0 && (
              <Typography
                variant="body2"
                sx={{ py: 2, textAlign: "center", color: "text.secondary" }}
              >
                No repositories found
              </Typography>
            )}
          </List>
        ) : (
          <List dense disablePadding>
            {rootEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                repo={selectedRepo}
                expanded={expanded}
                loadingDirs={loadingDirs}
                childrenCache={childrenCacheRef.current}
                hasMdCache={hasMdCacheRef.current}
                onToggle={handleToggle}
                onSelectFile={handleFileSelect}
              />
            ))}
            {rootEntries.length === 0 && (
              <Typography
                variant="body2"
                sx={{ py: 2, textAlign: "center", color: "text.secondary" }}
              >
                No Markdown files found
              </Typography>
            )}
          </List>
        )}
      </Box>
    </Box>
  );
};
