"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LockIcon from "@mui/icons-material/Lock";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { type FC, useCallback, useEffect, useState } from "react";

import type { GitHubRepo } from "../lib/githubApi";

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  name: string;
}

interface GitHubRepoBrowserProps {
  open: boolean;
  onClose: () => void;
  /** 選択されたファイルの所在。branch は開いた後の上書き保存先にもなる。 */
  onSelect: (repo: string, filePath: string, branch: string) => void;
}

/** ディレクトリ応答を Markdown とディレクトリのみに絞り、ディレクトリ優先で並べる。 */
function toTreeEntries(data: unknown): TreeEntry[] {
  if (!Array.isArray(data)) return [];
  return (data as { path: string; type: string; name: string }[])
    .map((item) => ({
      path: item.path,
      type: item.type === "dir" ? ("tree" as const) : ("blob" as const),
      name: item.name,
    }))
    .filter((e) => e.type === "tree" || e.name.endsWith(".md") || e.name.endsWith(".markdown"))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export const GitHubRepoBrowser: FC<Readonly<GitHubRepoBrowserProps>> = ({
  open,
  onClose,
  onSelect,
}) => {
  const t = useTranslations("Common");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branch, setBranch] = useState("");
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!open) return;
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
      .catch((e: unknown) => {
        console.warn(
          `[${new Date().toISOString()}] [WARN] Failed to fetch GitHub repos`,
          e instanceof Error ? e.stack : e,
        );
        setNeedsAuth(true);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const fetchDirectory = useCallback(
    async (repo: GitHubRepo, ref: string, dirPath: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/github/content?repo=${encodeURIComponent(repo.fullName)}&path=${encodeURIComponent(dirPath)}&ref=${encodeURIComponent(ref)}`,
        );
        if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
        setTree(toTreeEntries(await res.json()));
      } catch (e: unknown) {
        console.warn(
          `[${new Date().toISOString()}] [WARN] Failed to fetch GitHub tree ${repo.fullName}@${ref}:${dirPath}`,
          e instanceof Error ? e.stack : e,
        );
        setTree([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** ブランチ候補を取得する。失敗時は既定ブランチのみを候補にして続行する。 */
  const fetchBranches = useCallback(async (repo: GitHubRepo) => {
    try {
      const res = await fetch(`/api/github/branches?repo=${encodeURIComponent(repo.fullName)}`);
      if (!res.ok) throw new Error(`Failed to fetch branches: ${res.status}`);
      const data: unknown = await res.json();
      setBranchOptions(Array.isArray(data) && data.length > 0 ? data : [repo.defaultBranch]);
    } catch (e: unknown) {
      console.warn(
        `[${new Date().toISOString()}] [WARN] Failed to fetch GitHub branches ${repo.fullName}`,
        e instanceof Error ? e.stack : e,
      );
      setBranchOptions([repo.defaultBranch]);
    }
  }, []);

  const handleSelectRepo = useCallback(
    (repo: GitHubRepo) => {
      setSelectedRepo(repo);
      setBranch(repo.defaultBranch);
      setBranchOptions([repo.defaultBranch]);
      setCurrentPath("");
      void fetchBranches(repo);
      void fetchDirectory(repo, repo.defaultBranch, "");
    },
    [fetchBranches, fetchDirectory],
  );

  /** ブランチ切替はツリーの前提を変えるため、ルートまで戻して読み直す。 */
  const handleSelectBranch = useCallback(
    (next: string | null) => {
      if (!next || !selectedRepo || next === branch) return;
      setBranch(next);
      setCurrentPath("");
      void fetchDirectory(selectedRepo, next, "");
    },
    [branch, selectedRepo, fetchDirectory],
  );

  const handleBack = useCallback(() => {
    if (!selectedRepo) return;
    if (currentPath) {
      const parts = currentPath.split("/");
      parts.pop();
      const parentPath = parts.join("/");
      setCurrentPath(parentPath);
      void fetchDirectory(selectedRepo, branch, parentPath);
      return;
    }
    setSelectedRepo(null);
    setTree([]);
    setBranchOptions([]);
    setBranch("");
  }, [currentPath, selectedRepo, branch, fetchDirectory]);

  const handleSelectEntry = useCallback(
    (entry: TreeEntry) => {
      if (!selectedRepo) return;
      if (entry.type === "tree") {
        setCurrentPath(entry.path);
        void fetchDirectory(selectedRepo, branch, entry.path);
        return;
      }
      onSelect(selectedRepo.fullName, entry.path, branch);
      onClose();
    },
    [selectedRepo, branch, onSelect, onClose, fetchDirectory],
  );

  const handleClose = useCallback(() => {
    setSelectedRepo(null);
    setTree([]);
    setCurrentPath("");
    setBranch("");
    setBranchOptions([]);
    onClose();
  }, [onClose]);

  const title = selectedRepo
    ? currentPath || selectedRepo.fullName
    : t("githubOpenSelectRepo");

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {selectedRepo && (
          <IconButton size="small" onClick={handleBack} aria-label={t("githubOpenBack")}>
            <ArrowBackIcon />
          </IconButton>
        )}
        {title}
      </DialogTitle>
      <DialogContent>
        {needsAuth && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography sx={{ mb: 2 }}>{t("githubOpenSignInRequired")}</Typography>
            <Button variant="contained" onClick={() => void signIn("github")}>
              {t("githubOpenSignInButton")}
            </Button>
          </Box>
        )}
        {!needsAuth && selectedRepo && (
          <Autocomplete
            size="small"
            options={branchOptions}
            value={branch}
            onChange={(_, next) => handleSelectBranch(next)}
            disableClearable
            sx={{ mb: 1 }}
            renderInput={(params) => (
              <TextField {...params} label={t("githubOpenBranchLabel")} helperText="" />
            )}
          />
        )}
        {!needsAuth && loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {!needsAuth && !loading && selectedRepo && (
          <List>
            {tree.map((entry) => (
              <ListItemButton key={entry.path} onClick={() => handleSelectEntry(entry)}>
                <ListItemIcon>
                  {entry.type === "tree" ? <FolderIcon /> : <InsertDriveFileIcon />}
                </ListItemIcon>
                <ListItemText primary={entry.name} />
              </ListItemButton>
            ))}
            {tree.length === 0 && (
              <Typography sx={{ py: 2, textAlign: "center", color: "text.secondary" }}>
                {t("githubOpenNoMarkdown")}
              </Typography>
            )}
          </List>
        )}
        {!needsAuth && !loading && !selectedRepo && (
          <List>
            {repos.map((repo) => (
              <ListItemButton key={repo.fullName} onClick={() => handleSelectRepo(repo)}>
                <ListItemIcon>{repo.private ? <LockIcon /> : <FolderIcon />}</ListItemIcon>
                <ListItemText
                  primary={repo.fullName}
                  secondary={`${t("githubOpenDefaultBranch")}: ${repo.defaultBranch}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};
