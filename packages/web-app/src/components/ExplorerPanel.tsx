"use client";

import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CommitIcon from "@mui/icons-material/Commit";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import GitHubIcon from "@mui/icons-material/GitHub";
import HistoryIcon from "@mui/icons-material/History";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LockIcon from "@mui/icons-material/Lock";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import LogoutIcon from "@mui/icons-material/Logout";
import { signIn, signOut, useSession } from "next-auth/react";
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

interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface ExplorerPanelProps {
  open: boolean;
  width?: number;
  onSelectFile: (repo: string, filePath: string) => void;
  onSelectCommit?: (repo: string, filePath: string, sha: string) => void;
  isTimelineActive?: boolean;
  onToggleTimeline?: () => void;
}

const PANEL_WIDTH = 260;
const INDENT_PX = 16;

type ChildrenCache = Map<string, TreeEntry[]>;
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

async function fetchCommits(
  repo: string,
  filePath: string,
): Promise<CommitEntry[]> {
  const res = await fetch(
    `/api/github/commits?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data as CommitEntry[];
}

async function fetchBranches(repo: string): Promise<string[]> {
  const res = await fetch(
    `/api/github/branches?repo=${encodeURIComponent(repo)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function deleteFile(
  repo: string,
  filePath: string,
  branch: string,
): Promise<boolean> {
  const res = await fetch("/api/github/content", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo,
      path: filePath,
      message: `Delete ${filePath}`,
      branch,
    }),
  });
  return res.ok;
}

async function createFile(
  repo: string,
  filePath: string,
  branch: string,
): Promise<{ path: string } | null> {
  const res = await fetch("/api/github/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo,
      path: filePath,
      content: "",
      message: `Create ${filePath}`,
      branch,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { path: string };
}

async function renameFile(
  repo: string,
  oldPath: string,
  newPath: string,
  branch: string,
): Promise<boolean> {
  const res = await fetch("/api/github/content", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, oldPath, newPath, branch }),
  });
  return res.ok;
}

/** フォルダ内の全ファイルを再帰取得 */
async function listAllFiles(
  repo: string,
  branch: string,
  dirPath: string,
): Promise<string[]> {
  const entries = await fetchDirEntries(repo, branch, dirPath);
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type === "blob") {
      paths.push(entry.path);
    } else {
      const sub = await listAllFiles(repo, branch, entry.path);
      paths.push(...sub);
    }
  }
  return paths;
}

function formatCommitDate(dateStr: string): string {
  const d = new Date(dateStr);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${h}:${min}`;
}

function truncateMessage(msg: string, max = 40): string {
  const firstLine = msg.split("\n")[0];
  return firstLine.length > max ? firstLine.slice(0, max) + "..." : firstLine;
}

/** 新規ファイル入力行 */
const NewFileInput: FC<{
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}> = ({ depth, onSubmit, onCancel }) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const name = value.trim();
    if (!name) { onCancel(); return; }
    const finalName = name.endsWith(".md") || name.endsWith(".markdown") ? name : `${name}.md`;
    onSubmit(finalName);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        pl: 1 + (depth + 1) * (INDENT_PX / 8),
        pr: 0.5,
        py: 0.25,
        minHeight: 28,
      }}
    >
      <Box sx={{ width: 20 }} />
      <NoteAddIcon sx={{ fontSize: 16, color: "primary.main", mr: 0.5, flexShrink: 0 }} />
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={handleSubmit}
        placeholder="filename.md"
        variant="standard"
        size="small"
        fullWidth
        InputProps={{
          disableUnderline: false,
          sx: { fontSize: "0.78rem", py: 0 },
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleSubmit} sx={{ p: 0.25 }}>
                <AddIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
};

/** リネーム入力行 */
const RenameInput: FC<{
  currentName: string;
  isDir: boolean;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
}> = ({ currentName, isDir, onSubmit, onCancel }) => {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // 拡張子を除いた部分を選択
    if (inputRef.current) {
      const dotIdx = currentName.lastIndexOf(".");
      const end = !isDir && dotIdx > 0 ? dotIdx : currentName.length;
      inputRef.current.setSelectionRange(0, end);
    }
  }, [currentName, isDir]);

  const handleSubmit = () => {
    const name = value.trim();
    if (!name || name === currentName) { onCancel(); return; }
    onSubmit(name);
  };

  return (
    <TextField
      inputRef={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSubmit();
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onBlur={handleSubmit}
      variant="standard"
      size="small"
      fullWidth
      InputProps={{
        disableUnderline: false,
        sx: { fontSize: "0.78rem", py: 0 },
      }}
    />
  );
};

/** 新規フォルダ入力行 */
const NewFolderInput: FC<{
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}> = ({ depth, onSubmit, onCancel }) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const name = value.trim();
    if (!name) { onCancel(); return; }
    onSubmit(name);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        pl: 1 + (depth + 1) * (INDENT_PX / 8),
        pr: 0.5,
        py: 0.25,
        minHeight: 28,
      }}
    >
      <Box sx={{ width: 20 }} />
      <CreateNewFolderIcon sx={{ fontSize: 16, color: "primary.main", mr: 0.5, flexShrink: 0 }} />
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={handleSubmit}
        placeholder="folder name"
        variant="standard"
        size="small"
        fullWidth
        InputProps={{
          disableUnderline: false,
          sx: { fontSize: "0.78rem", py: 0 },
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleSubmit} sx={{ p: 0.25 }}>
                <AddIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
};

/** 再帰ツリーノード */
const TreeNode: FC<{
  entry: TreeEntry;
  depth: number;
  repo: GitHubRepo;
  expanded: Set<string>;
  loadingDirs: Set<string>;
  childrenCache: ChildrenCache;
  hasMdCache: HasMdCache;
  selectedFilePath: string | null;
  onToggle: (entry: TreeEntry) => void;
  onSelectFile: (path: string) => void;
  onCreateFile: (dirPath: string, fileName: string) => void;
  onDeleteFile: (filePath: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onCreateFolder: (dirPath: string, folderName: string) => void;
  renamingPath: string | null;
  onStartRename: (path: string) => void;
  onCancelRename: () => void;
  creatingInDir: string | null;
  onStartCreate: (dirPath: string) => void;
  onCancelCreate: () => void;
  creatingFolderInDir: string | null;
  onStartCreateFolder: (dirPath: string) => void;
  onCancelCreateFolder: () => void;
  dragOverPath: string | null;
  onMoveEntry: (sourcePath: string, targetDir: string) => void;
  onDragOverPath: (path: string | null) => void;
  dragSourceRef: React.MutableRefObject<string | null>;
}> = ({ entry, depth, repo, expanded, loadingDirs, childrenCache, hasMdCache, selectedFilePath, onToggle, onSelectFile, onCreateFile, onDeleteFile, onRename, onCreateFolder, renamingPath, onStartRename, onCancelRename, creatingInDir, onStartCreate, onCancelCreate, creatingFolderInDir, onStartCreateFolder, onCancelCreateFolder, dragOverPath, onMoveEntry, onDragOverPath, dragSourceRef }) => {
  const isDir = entry.type === "tree";
  const isOpen = expanded.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const children = childrenCache.get(entry.path);
  const hasMd = hasMdCache.get(entry.path);
  const empty = isDir && hasMd === false;
  const emptyColor = "text.disabled";
  const isSelected = !isDir && entry.path === selectedFilePath;
  const isRenaming = renamingPath === entry.path;
  const isDragOver = isDir && dragOverPath === entry.path;

  return (
    <>
      <ListItemButton
        draggable={!isRenaming}
        onDragStart={(e) => {
          dragSourceRef.current = entry.path;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", entry.path);
        }}
        onDragEnd={() => {
          dragSourceRef.current = null;
          onDragOverPath(null);
        }}
        onDragOver={(e) => {
          if (!isDir) return;
          const src = dragSourceRef.current;
          if (!src || src === entry.path || src.startsWith(entry.path + "/")) return;
          // 同じ親フォルダへのドロップは無意味
          const srcDir = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";
          if (srcDir === entry.path) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOverPath(entry.path);
        }}
        onDragLeave={() => {
          if (isDragOver) onDragOverPath(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDragOverPath(null);
          const src = dragSourceRef.current;
          if (!src || !isDir) return;
          dragSourceRef.current = null;
          onMoveEntry(src, entry.path);
        }}
        onClick={() => {
          if (isRenaming) return;
          if (isDir) { if (!empty) onToggle(entry); }
          else onSelectFile(entry.path);
        }}
        disabled={empty}
        selected={isSelected}
        sx={{
          py: 0.25,
          pl: 1 + depth * (INDENT_PX / 8),
          minHeight: 28,
          "&.Mui-disabled": { opacity: 1 },
          ...(isDragOver && {
            bgcolor: "action.hover",
            outline: "1px dashed",
            outlineColor: "primary.main",
            outlineOffset: -1,
          }),
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
        {isRenaming ? (
          <RenameInput
            currentName={entry.name}
            isDir={isDir}
            onSubmit={(newName) => onRename(entry.path, newName)}
            onCancel={onCancelRename}
          />
        ) : (
          <ListItemText
            primary={entry.name}
            primaryTypographyProps={{
              variant: "body2",
              noWrap: true,
              fontSize: "0.8rem",
              color: empty ? emptyColor : undefined,
            }}
          />
        )}
        {!isRenaming && (
          <>
            {/* Rename icon (file & folder) */}
            {!empty && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename(entry.path);
                }}
                sx={{
                  p: 0.25,
                  opacity: 0,
                  ".MuiListItemButton-root:hover &": { opacity: 1 },
                }}
              >
                <DriveFileRenameOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
            {/* Folder: new folder icon */}
            {isDir && !empty && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isOpen) onToggle(entry);
                  onStartCreateFolder(entry.path);
                }}
                sx={{
                  p: 0.25,
                  opacity: 0,
                  ".MuiListItemButton-root:hover &": { opacity: 1 },
                }}
              >
                <CreateNewFolderIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
            {/* Folder: new file icon */}
            {isDir && !empty && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isOpen) onToggle(entry);
                  onStartCreate(entry.path);
                }}
                sx={{
                  p: 0.25,
                  opacity: 0,
                  ".MuiListItemButton-root:hover &": { opacity: 1 },
                }}
              >
                <AddIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
            {/* File: delete icon */}
            {!isDir && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(entry.path);
                }}
                sx={{
                  p: 0.25,
                  opacity: 0,
                  ".MuiListItemButton-root:hover &": { opacity: 1 },
                  color: "error.main",
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </>
        )}
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
                selectedFilePath={selectedFilePath}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
                onCreateFile={onCreateFile}
                onDeleteFile={onDeleteFile}
                onRename={onRename}
                onCreateFolder={onCreateFolder}
                renamingPath={renamingPath}
                onStartRename={onStartRename}
                onCancelRename={onCancelRename}
                creatingInDir={creatingInDir}
                onStartCreate={onStartCreate}
                onCancelCreate={onCancelCreate}
                creatingFolderInDir={creatingFolderInDir}
                onStartCreateFolder={onStartCreateFolder}
                onCancelCreateFolder={onCancelCreateFolder}
                dragOverPath={dragOverPath}
                onMoveEntry={onMoveEntry}
                onDragOverPath={onDragOverPath}
                dragSourceRef={dragSourceRef}
              />
            ))}
            {creatingFolderInDir === entry.path && (
              <NewFolderInput
                depth={depth}
                onSubmit={(name) => onCreateFolder(entry.path, name)}
                onCancel={onCancelCreateFolder}
              />
            )}
            {creatingInDir === entry.path && (
              <NewFileInput
                depth={depth}
                onSubmit={(name) => onCreateFile(entry.path, name)}
                onCancel={onCancelCreate}
              />
            )}
            {children?.length === 0 && creatingInDir !== entry.path && (
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

/** Git History セクション */
const GitHistorySection: FC<{
  commits: CommitEntry[];
  loading: boolean;
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
}> = ({ commits, loading, selectedSha, onSelectCommit }) => {
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (commits.length === 0) {
    return (
      <Typography variant="caption" sx={{ py: 2, textAlign: "center", display: "block", color: "text.secondary" }}>
        No commit history
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {commits.map((c) => (
        <ListItemButton
          key={c.sha}
          selected={c.sha === selectedSha}
          onClick={() => onSelectCommit(c.sha)}
          sx={{ py: 0.25, minHeight: 32, alignItems: "flex-start" }}
        >
          <ListItemIcon sx={{ minWidth: 24, mt: 0.5 }}>
            <CommitIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primary={truncateMessage(c.message)}
            secondary={`${formatCommitDate(c.date)} · ${c.author}`}
            primaryTypographyProps={{ variant: "body2", fontSize: "0.78rem", noWrap: true }}
            secondaryTypographyProps={{ variant: "caption", fontSize: "0.68rem", noWrap: true }}
          />
        </ListItemButton>
      ))}
    </List>
  );
};

export const ExplorerPanel: FC<ExplorerPanelProps> = ({
  open,
  width = PANEL_WIDTH,
  onSelectFile,
  onSelectCommit,
  isTimelineActive,
  onToggleTimeline,
}) => {
  const { data: session } = useSession();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [rootEntries, setRootEntries] = useState<TreeEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const childrenCacheRef = useRef<ChildrenCache>(new Map());
  const hasMdCacheRef = useRef<HasMdCache>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);
  const bumpCache = useCallback(() => setCacheVersion((v) => v + 1), []);

  // 選択中ファイル & Git History
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  // ブランチ選択ダイアログ
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchDialogRepo, setBranchDialogRepo] = useState<GitHubRepo | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // 新規ファイル作成
  const [creatingInDir, setCreatingInDir] = useState<string | null>(null);
  // 新規フォルダ作成
  const [creatingFolderInDir, setCreatingFolderInDir] = useState<string | null>(null);
  // リネーム
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // ドラッグ&ドロップ
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);

  const prefetchSubtree = useCallback(
    async (repo: GitHubRepo, branch: string, dirPath: string): Promise<boolean> => {
      const cached = hasMdCacheRef.current.get(dirPath);
      if (cached !== undefined) return cached;

      let entries = childrenCacheRef.current.get(dirPath);
      if (!entries) {
        entries = await fetchDirEntries(repo.fullName, branch, dirPath);
        childrenCacheRef.current.set(dirPath, entries);
      }

      const hasDirectMd = entries.some((e) => e.type === "blob");
      if (hasDirectMd) {
        hasMdCacheRef.current.set(dirPath, true);
        bumpCache();
        const subDirs = entries.filter((e) => e.type === "tree");
        await Promise.all(subDirs.map((d) => prefetchSubtree(repo, branch, d.path)));
        return true;
      }

      const subDirs = entries.filter((e) => e.type === "tree");
      if (subDirs.length === 0) {
        hasMdCacheRef.current.set(dirPath, false);
        bumpCache();
        return false;
      }

      const results = await Promise.all(
        subDirs.map((d) => prefetchSubtree(repo, branch, d.path)),
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

  const loadTree = useCallback(
    async (repo: GitHubRepo, branch: string) => {
      setExpanded(new Set());
      setSelectedFilePath(null);
      setCommits([]);
      setSelectedSha(null);
      setCreatingInDir(null);
      childrenCacheRef.current = new Map();
      hasMdCacheRef.current = new Map();
      setLoading(true);
      const entries = await fetchDirEntries(repo.fullName, branch, "");
      childrenCacheRef.current.set("", entries);
      setRootEntries(entries);
      setLoading(false);

      const subDirs = entries.filter((e) => e.type === "tree");
      subDirs.forEach((d) => prefetchSubtree(repo, branch, d.path));
    },
    [prefetchSubtree],
  );

  const handleSelectRepo = useCallback(
    async (repo: GitHubRepo) => {
      setBranchDialogRepo(repo);
      setBranches([]);
      setBranchesLoading(true);
      setBranchDialogOpen(true);
      const b = await fetchBranches(repo.fullName);
      const sorted = [repo.defaultBranch, ...b.filter((n) => n !== repo.defaultBranch)];
      setBranches(sorted);
      setBranchesLoading(false);
    },
    [],
  );

  const handleBranchSelect = useCallback(
    async (branch: string) => {
      const repo = branchDialogRepo;
      if (!repo) return;
      setBranchDialogOpen(false);
      setSelectedRepo(repo);
      setSelectedBranch(branch);
      await loadTree(repo, branch);
    },
    [branchDialogRepo, loadTree],
  );

  const handleBranchDialogClose = useCallback(() => {
    setBranchDialogOpen(false);
    setBranchDialogRepo(null);
  }, []);

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

      if (!childrenCacheRef.current.has(path)) {
        setLoadingDirs((prev) => new Set(prev).add(path));
        const children = await fetchDirEntries(
          selectedRepo.fullName,
          selectedBranch,
          path,
        );
        childrenCacheRef.current.set(path, children);
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        const subDirs = children.filter((e) => e.type === "tree");
        subDirs.forEach((d) => prefetchSubtree(selectedRepo, selectedBranch, d.path));
      }

      setExpanded((prev) => new Set(prev).add(path));
    },
    [selectedRepo, selectedBranch, expanded, prefetchSubtree],
  );

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!selectedRepo) return;
      setSelectedFilePath(filePath);
      setSelectedSha(null);
      onSelectFile(selectedRepo.fullName, filePath);

      // コミット履歴を取得
      setCommitsLoading(true);
      const commitList = await fetchCommits(selectedRepo.fullName, filePath);
      setCommits(commitList);
      setCommitsLoading(false);
    },
    [selectedRepo, onSelectFile],
  );

  const handleCommitSelect = useCallback(
    (sha: string) => {
      if (!selectedRepo || !selectedFilePath) return;
      setSelectedSha(sha);
      onSelectCommit?.(selectedRepo.fullName, selectedFilePath, sha);
    },
    [selectedRepo, selectedFilePath, onSelectCommit],
  );

  const handleCreateFile = useCallback(
    async (dirPath: string, fileName: string) => {
      if (!selectedRepo) return;
      setCreatingInDir(null);
      const filePath = dirPath ? `${dirPath}/${fileName}` : fileName;
      const result = await createFile(
        selectedRepo.fullName,
        filePath,
        selectedBranch,
      );
      if (!result) return;

      // キャッシュにエントリを追加
      const newEntry: TreeEntry = { path: filePath, type: "blob", name: fileName };
      const existing = childrenCacheRef.current.get(dirPath) ?? [];
      childrenCacheRef.current.set(dirPath, [...existing, newEntry].sort((a, b) => {
        if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      hasMdCacheRef.current.set(dirPath, true);
      if (dirPath === "") {
        setRootEntries([...childrenCacheRef.current.get("") ?? []]);
      }
      bumpCache();

      // 作成したファイルを選択
      handleFileSelect(filePath);
    },
    [selectedRepo, selectedBranch, bumpCache, handleFileSelect],
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      if (!selectedRepo) return;
      if (!window.confirm(`Delete "${filePath.split("/").pop()}"?`)) return;

      const ok = await deleteFile(
        selectedRepo.fullName,
        filePath,
        selectedBranch,
      );
      if (!ok) return;

      // キャッシュからエントリを削除
      const dirPath = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
      const entries = childrenCacheRef.current.get(dirPath);
      if (entries) {
        const updated = entries.filter((e) => e.path !== filePath);
        childrenCacheRef.current.set(dirPath, updated);
        // md ファイルがなくなったらキャッシュ更新
        if (!updated.some((e) => e.type === "blob")) {
          hasMdCacheRef.current.set(dirPath, updated.some((e) => e.type === "tree" && hasMdCacheRef.current.get(e.path) === true));
        }
        if (dirPath === "") {
          setRootEntries([...updated]);
        }
        bumpCache();
      }

      // 削除したファイルが選択中なら選択解除
      if (selectedFilePath === filePath) {
        setSelectedFilePath(null);
        setCommits([]);
        setSelectedSha(null);
      }
    },
    [selectedRepo, selectedBranch, selectedFilePath, bumpCache],
  );

  const handleCreateFolder = useCallback(
    async (dirPath: string, folderName: string) => {
      if (!selectedRepo) return;
      setCreatingFolderInDir(null);
      const folderPath = dirPath ? `${dirPath}/${folderName}` : folderName;
      const gitkeepPath = `${folderPath}/.gitkeep`;
      const result = await createFile(
        selectedRepo.fullName,
        gitkeepPath,
        selectedBranch,
      );
      if (!result) return;

      // キャッシュにフォルダエントリを追加
      const newEntry: TreeEntry = { path: folderPath, type: "tree", name: folderName };
      const existing = childrenCacheRef.current.get(dirPath) ?? [];
      childrenCacheRef.current.set(dirPath, [...existing, newEntry].sort((a, b) => {
        if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      // 新フォルダの子エントリ (.gitkeep は md でないので空リスト)
      childrenCacheRef.current.set(folderPath, []);
      hasMdCacheRef.current.set(folderPath, false);
      hasMdCacheRef.current.set(dirPath, true);
      if (dirPath === "") {
        setRootEntries([...childrenCacheRef.current.get("") ?? []]);
      }
      bumpCache();
    },
    [selectedRepo, selectedBranch, bumpCache],
  );

  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      if (!selectedRepo) return;
      setRenamingPath(null);

      const dirPath = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/")) : "";
      const entries = childrenCacheRef.current.get(dirPath) ?? [];
      const entry = entries.find((e) => e.path === oldPath);
      if (!entry) return;

      const isDir = entry.type === "tree";
      const newPath = dirPath ? `${dirPath}/${newName}` : newName;

      if (isDir) {
        // フォルダリネーム: 全ファイルを再帰取得してリネーム
        const allFiles = await listAllFiles(
          selectedRepo.fullName,
          selectedBranch,
          oldPath,
        );
        if (allFiles.length === 0) return;

        let allOk = true;
        for (const filePath of allFiles) {
          const relativeSuffix = filePath.slice(oldPath.length);
          const newFilePath = newPath + relativeSuffix;
          const ok = await renameFile(
            selectedRepo.fullName,
            filePath,
            newFilePath,
            selectedBranch,
          );
          if (!ok) { allOk = false; break; }
        }
        if (!allOk) return;

        // キャッシュ更新: 古いエントリを新しいパスに差し替え
        const updated = entries.map((e) =>
          e.path === oldPath ? { ...e, path: newPath, name: newName } : e,
        ).sort((a, b) => {
          if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        childrenCacheRef.current.set(dirPath, updated);

        // 古いキャッシュを削除し、サブツリーを再取得
        childrenCacheRef.current.delete(oldPath);
        hasMdCacheRef.current.delete(oldPath);

        if (dirPath === "") {
          setRootEntries([...updated]);
        }

        // 展開状態を更新
        setExpanded((prev) => {
          const next = new Set<string>();
          for (const p of prev) {
            if (p === oldPath) next.add(newPath);
            else if (p.startsWith(oldPath + "/")) next.add(newPath + p.slice(oldPath.length));
            else next.add(p);
          }
          return next;
        });
      } else {
        // ファイルリネーム
        const ok = await renameFile(
          selectedRepo.fullName,
          oldPath,
          newPath,
          selectedBranch,
        );
        if (!ok) return;

        // キャッシュ更新
        const updated = entries.map((e) =>
          e.path === oldPath ? { ...e, path: newPath, name: newName } : e,
        ).sort((a, b) => {
          if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        childrenCacheRef.current.set(dirPath, updated);

        // 選択中のファイルパスを更新
        if (selectedFilePath === oldPath) {
          setSelectedFilePath(newPath);
        }
      }

      if (dirPath === "") {
        setRootEntries([...childrenCacheRef.current.get("") ?? []]);
      }
      bumpCache();
    },
    [selectedRepo, selectedBranch, selectedFilePath, bumpCache],
  );

  const handleMoveEntry = useCallback(
    async (sourcePath: string, targetDir: string) => {
      if (!selectedRepo) return;

      const srcDir = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";
      if (srcDir === targetDir) return;

      const srcEntries = childrenCacheRef.current.get(srcDir) ?? [];
      const entry = srcEntries.find((e) => e.path === sourcePath);
      if (!entry) return;

      const name = entry.name;
      const newPath = targetDir ? `${targetDir}/${name}` : name;
      const isDir = entry.type === "tree";

      if (isDir) {
        const allFiles = await listAllFiles(
          selectedRepo.fullName,
          selectedBranch,
          sourcePath,
        );
        if (allFiles.length === 0) return;
        let allOk = true;
        for (const filePath of allFiles) {
          const suffix = filePath.slice(sourcePath.length);
          const ok = await renameFile(
            selectedRepo.fullName,
            filePath,
            newPath + suffix,
            selectedBranch,
          );
          if (!ok) { allOk = false; break; }
        }
        if (!allOk) return;
      } else {
        const ok = await renameFile(
          selectedRepo.fullName,
          sourcePath,
          newPath,
          selectedBranch,
        );
        if (!ok) return;
      }

      // キャッシュ更新: ソースから削除
      const updatedSrc = srcEntries.filter((e) => e.path !== sourcePath);
      childrenCacheRef.current.set(srcDir, updatedSrc);
      if (!updatedSrc.some((e) => e.type === "blob")) {
        hasMdCacheRef.current.set(srcDir, updatedSrc.some((e) => e.type === "tree" && hasMdCacheRef.current.get(e.path) === true));
      }

      // ターゲットに追加
      const movedEntry: TreeEntry = { ...entry, path: newPath };
      const targetEntries = childrenCacheRef.current.get(targetDir) ?? [];
      childrenCacheRef.current.set(targetDir, [...targetEntries, movedEntry].sort((a, b) => {
        if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      if (!isDir) {
        hasMdCacheRef.current.set(targetDir, true);
      }

      // フォルダのサブキャッシュ移動
      if (isDir) {
        childrenCacheRef.current.delete(sourcePath);
        hasMdCacheRef.current.delete(sourcePath);
      }

      // 選択中ファイルのパス更新
      if (selectedFilePath === sourcePath) {
        setSelectedFilePath(newPath);
      } else if (isDir && selectedFilePath?.startsWith(sourcePath + "/")) {
        setSelectedFilePath(newPath + selectedFilePath.slice(sourcePath.length));
      }

      // 展開状態の更新
      if (isDir) {
        setExpanded((prev) => {
          const next = new Set<string>();
          for (const p of prev) {
            if (p === sourcePath) next.add(newPath);
            else if (p.startsWith(sourcePath + "/")) next.add(newPath + p.slice(sourcePath.length));
            else next.add(p);
          }
          return next;
        });
      }

      if (srcDir === "" || targetDir === "") {
        setRootEntries([...childrenCacheRef.current.get("") ?? []]);
      }
      bumpCache();
    },
    [selectedRepo, selectedBranch, selectedFilePath, bumpCache],
  );

  if (!open) return null;

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
      {/* === Upper: Explorer === */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.5,
          minHeight: 32,
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
          <Typography variant="caption" sx={{ fontWeight: 600, px: 0.5, flex: 1 }}>
            EXPLORER
          </Typography>
        )}
        {selectedRepo && (
          <Tooltip title="New file">
            <IconButton
              size="small"
              onClick={() => setCreatingInDir("")}
              sx={{ p: 0.5 }}
            >
              <NoteAddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {session && (
          <Tooltip title="Sign out">
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
      <Divider />

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
        {needsAuth ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 6, px: 2, gap: 2 }}>
            <GitHubIcon sx={{ fontSize: 48, color: "text.secondary" }} />
            <Button
              variant="contained"
              size="small"
              startIcon={<GitHubIcon />}
              onClick={() => signIn("github")}
              sx={{
                textTransform: "none",
                bgcolor: "#24292f",
                "&:hover": { bgcolor: "#32383f" },
                borderRadius: 2,
                px: 2.5,
                py: 0.75,
              }}
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
          <List
            dense
            disablePadding
            onDragOver={(e) => {
              const src = dragSourceRef.current;
              if (!src) return;
              const srcDir = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";
              if (srcDir === "") return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverPath("__root__");
            }}
            onDragLeave={() => {
              if (dragOverPath === "__root__") setDragOverPath(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverPath(null);
              const src = dragSourceRef.current;
              if (!src) return;
              dragSourceRef.current = null;
              // ルートへ移動
              const srcDir = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";
              if (srcDir === "") return;
              handleMoveEntry(src, "");
            }}
            sx={{
              ...(dragOverPath === "__root__" && {
                bgcolor: "action.hover",
              }),
            }}
          >
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
            ))}
            {creatingFolderInDir === "" && (
              <NewFolderInput
                depth={-1}
                onSubmit={(name) => handleCreateFolder("", name)}
                onCancel={() => setCreatingFolderInDir(null)}
              />
            )}
            {creatingInDir === "" && (
              <NewFileInput
                depth={-1}
                onSubmit={(name) => handleCreateFile("", name)}
                onCancel={() => setCreatingInDir(null)}
              />
            )}
            {rootEntries.length === 0 && creatingInDir !== "" && (
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
              GIT HISTORY
            </Typography>
            <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary", fontSize: "0.65rem", flex: 1 }} noWrap>
              {selectedFilePath.split("/").pop()}
            </Typography>
            {onToggleTimeline && (
              <Tooltip title="Timeline">
                <IconButton
                  size="small"
                  onClick={onToggleTimeline}
                  sx={{
                    p: 0.5,
                    color: isTimelineActive ? "primary.main" : "text.secondary",
                  }}
                >
                  <HistoryIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflow: "auto", minHeight: 100, maxHeight: "40%" }}>
            <GitHistorySection
              commits={commits}
              loading={commitsLoading}
              selectedSha={selectedSha}
              onSelectCommit={handleCommitSelect}
            />
          </Box>
        </>
      )}

      {/* === Branch selection dialog === */}
      <Dialog
        open={branchDialogOpen}
        onClose={handleBranchDialogClose}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontSize: "0.9rem", pb: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AccountTreeIcon sx={{ fontSize: 18 }} />
            {branchDialogRepo?.fullName}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: 1, py: 1 }}>
          {branchesLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List dense disablePadding>
              {branches.map((branch) => (
                <ListItemButton
                  key={branch}
                  onClick={() => handleBranchSelect(branch)}
                  sx={{ py: 0.5, borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <AccountTreeIcon sx={{ fontSize: 16 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={branch}
                    primaryTypographyProps={{
                      variant: "body2",
                      fontWeight:
                        branch === branchDialogRepo?.defaultBranch
                          ? 700
                          : 400,
                    }}
                  />
                  {branch === branchDialogRepo?.defaultBranch && (
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", fontSize: "0.65rem" }}
                    >
                      default
                    </Typography>
                  )}
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};
