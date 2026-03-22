"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LockIcon from "@mui/icons-material/Lock";
import {
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
  Typography,
} from "@mui/material";
import { signIn } from "next-auth/react";
import { type FC, useCallback, useEffect, useState } from "react";

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

interface GitHubRepoBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (repo: string, filePath: string) => void;
}

export const GitHubRepoBrowser: FC<GitHubRepoBrowserProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Fetch repos on open
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
      .catch(() => setNeedsAuth(true))
      .finally(() => setLoading(false));
  }, [open]);

  // Fetch directory contents
  const fetchDirectory = useCallback(
    async (repo: GitHubRepo, dirPath: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/github/content?repo=${encodeURIComponent(repo.fullName)}&path=${encodeURIComponent(dirPath)}&ref=${encodeURIComponent(repo.defaultBranch)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch tree");
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          const entries: TreeEntry[] = (
            data as { path: string; type: string; name: string }[]
          )
            .map((item) => ({
              path: item.path,
              type: item.type === "dir" ? "tree" as const : "blob" as const,
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
          setTree(entries);
        }
      } catch {
        setTree([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSelectRepo = useCallback(
    (repo: GitHubRepo) => {
      setSelectedRepo(repo);
      setCurrentPath("");
      fetchDirectory(repo, "");
    },
    [fetchDirectory],
  );

  const handleBack = useCallback(() => {
    if (currentPath) {
      const parts = currentPath.split("/");
      parts.pop();
      const parentPath = parts.join("/");
      setCurrentPath(parentPath);
      if (selectedRepo) fetchDirectory(selectedRepo, parentPath);
    } else {
      setSelectedRepo(null);
      setTree([]);
    }
  }, [currentPath, selectedRepo, fetchDirectory]);

  const handleSelectEntry = useCallback(
    (entry: TreeEntry) => {
      if (entry.type === "tree") {
        setCurrentPath(entry.path);
        if (selectedRepo) fetchDirectory(selectedRepo, entry.path);
      } else if (selectedRepo) {
        onSelect(selectedRepo.fullName, entry.path);
        onClose();
      }
    },
    [selectedRepo, onSelect, onClose, fetchDirectory],
  );

  const handleClose = useCallback(() => {
    setSelectedRepo(null);
    setTree([]);
    setCurrentPath("");
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {selectedRepo && (
          <IconButton size="small" onClick={handleBack} aria-label="Go back">
            <ArrowBackIcon />
          </IconButton>
        )}
        {selectedRepo
          ? currentPath || selectedRepo.fullName
          : "Select Repository"}
      </DialogTitle>
      <DialogContent>
        {needsAuth && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography sx={{ mb: 2 }}>
              GitHub authentication required
            </Typography>
            <Button variant="contained" onClick={() => signIn("github")}>
              Sign in with GitHub
            </Button>
          </Box>
        )}
        {!needsAuth && loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {!needsAuth && !loading && selectedRepo && (
          <List>
            {tree.map((entry) => (
              <ListItemButton
                key={entry.path}
                onClick={() => handleSelectEntry(entry)}
              >
                <ListItemIcon>
                  {entry.type === "tree" ? (
                    <FolderIcon />
                  ) : (
                    <InsertDriveFileIcon />
                  )}
                </ListItemIcon>
                <ListItemText primary={entry.name} />
              </ListItemButton>
            ))}
            {tree.length === 0 && (
              <Typography
                sx={{ py: 2, textAlign: "center", color: "text.secondary" }}
              >
                No Markdown files found
              </Typography>
            )}
          </List>
        )}
        {!needsAuth && !loading && !selectedRepo && (
          <List>
            {repos.map((repo) => (
              <ListItemButton
                key={repo.fullName}
                onClick={() => handleSelectRepo(repo)}
              >
                <ListItemIcon>
                  {repo.private ? <LockIcon /> : <FolderIcon />}
                </ListItemIcon>
                <ListItemText
                  primary={repo.fullName}
                  secondary={`Default: ${repo.defaultBranch}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};
