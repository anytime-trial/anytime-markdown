"use client";

import { List, Typography } from "@mui/material";
import type { FC } from "react";

import { NewFileInput, NewFolderInput } from "../inputs";
import { TreeNode } from "../TreeNode";
import type { ChildrenCache, GitHubRepo, HasMdCache, TreeEntry } from "../types";

interface TreeViewSectionProps {
  repo: GitHubRepo;
  rootEntries: TreeEntry[];
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
  dragSourceRef: React.RefObject<string | null>;
}

export const TreeViewSection: FC<TreeViewSectionProps> = ({
  repo,
  rootEntries,
  expanded,
  loadingDirs,
  childrenCache,
  hasMdCache,
  selectedFilePath,
  onToggle,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRename,
  onCreateFolder,
  renamingPath,
  onStartRename,
  onCancelRename,
  creatingInDir,
  onStartCreate,
  onCancelCreate,
  creatingFolderInDir,
  onStartCreateFolder,
  onCancelCreateFolder,
  dragOverPath,
  onMoveEntry,
  onDragOverPath,
  dragSourceRef,
}) => {
  return (
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
        onDragOverPath("__root__");
      }}
      onDragLeave={() => {
        if (dragOverPath === "__root__") onDragOverPath(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverPath(null);
        const src = dragSourceRef.current;
        if (!src) return;
        dragSourceRef.current = null;
        // ルートへ移動
        const srcDir = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";
        if (srcDir === "") return;
        onMoveEntry(src, "");
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
      {creatingFolderInDir === "" && (
        <NewFolderInput
          depth={-1}
          onSubmit={(name) => onCreateFolder("", name)}
          onCancel={onCancelCreateFolder}
        />
      )}
      {creatingInDir === "" && (
        <NewFileInput
          depth={-1}
          onSubmit={(name) => onCreateFile("", name)}
          onCancel={onCancelCreate}
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
  );
};
