"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LockIcon from "@mui/icons-material/Lock";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
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

interface ExplorerPanelProps {
  open: boolean;
  width?: number;
  onSelectFile: (repo: string, filePath: string) => void;
}

const PANEL_WIDTH = 260;

export const ExplorerPanel: FC<ExplorerPanelProps> = ({
  open,
  width = PANEL_WIDTH,
  onSelectFile,
}) => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

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
              type: (item.type === "dir" ? "tree" : "blob") as
                | "tree"
                | "blob",
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
        onSelectFile(selectedRepo.fullName, entry.path);
      }
    },
    [selectedRepo, onSelectFile, fetchDirectory],
  );

  if (!open) return null;

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
        {selectedRepo && (
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ minWidth: 0, textTransform: "none" }}>
            {currentPath ? currentPath.split("/").pop() : selectedRepo.fullName.split("/").pop()}
          </Button>
        )}
        {!selectedRepo && (
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
            {tree.map((entry) => (
              <ListItemButton
                key={entry.path}
                onClick={() => handleSelectEntry(entry)}
                sx={{ py: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  {entry.type === "tree" ? (
                    <FolderIcon fontSize="small" />
                  ) : (
                    <InsertDriveFileIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={entry.name}
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                />
              </ListItemButton>
            ))}
            {tree.length === 0 && (
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
