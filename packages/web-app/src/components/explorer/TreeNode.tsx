"use client";

import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import {
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import type { FC } from "react";
import { memo } from "react";

import { NewFileInput, NewFolderInput, RenameInput } from "./inputs";
import type { TreeNodeProps } from "./types";
import { INDENT_PX } from "./types";

/** フォルダの展開/折りたたみアイコン */
const DirExpandIcon: FC<{ isLoading: boolean; empty: boolean; isOpen: boolean; emptyColor: string }> = ({ isLoading, empty, isOpen, emptyColor }) => {
  if (isLoading) return <CircularProgress size={14} />;
  if (empty) return <ChevronRightIcon sx={{ fontSize: 18, color: emptyColor }} />;
  if (isOpen) return <ExpandMoreIcon sx={{ fontSize: 18 }} />;
  return <ChevronRightIcon sx={{ fontSize: 18 }} />;
};

/** フォルダ/ファイルのアイコン */
const EntryIcon: FC<{ isDir: boolean; isOpen: boolean; empty: boolean; emptyColor: string }> = ({ isDir, isOpen, empty, emptyColor }) => {
  if (!isDir) return <InsertDriveFileIcon sx={{ fontSize: 18 }} />;
  if (isOpen) return <FolderOpenIcon sx={{ fontSize: 18, color: empty ? emptyColor : undefined }} />;
  return <FolderIcon sx={{ fontSize: 18, color: empty ? emptyColor : undefined }} />;
};

/** ホバー時表示のアクションボタン群 */
const ActionButtons: FC<{
  isDir: boolean; empty: boolean; isOpen: boolean;
  entryPath: string;
  onToggle: () => void; onStartRename: (p: string) => void;
  onStartCreateFolder: (p: string) => void; onStartCreate: (p: string) => void;
  onDeleteFile: (p: string) => void;
}> = memo(({ isDir, empty, isOpen, entryPath, onToggle, onStartRename, onStartCreateFolder, onStartCreate, onDeleteFile }) => {
  const hoverSx = { p: 0.25, opacity: 0, ".MuiListItemButton-root:hover &": { opacity: 1 } };
  return (
    <>
      {!empty && (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onStartRename(entryPath); }} sx={hoverSx}>
          <DriveFileRenameOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
      {isDir && (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); if (!isOpen) onToggle(); onStartCreateFolder(entryPath); }} sx={hoverSx}>
          <CreateNewFolderIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
      {isDir && (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); if (!isOpen) onToggle(); onStartCreate(entryPath); }} sx={hoverSx}>
          <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
      {!empty && (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDeleteFile(entryPath); }} sx={{ ...hoverSx, color: "error.main" }}>
          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </>
  );
});
ActionButtons.displayName = "ActionButtons";

/** 再帰ツリーノード */
export const TreeNode: FC<TreeNodeProps> = ({ entry, depth, repo, expanded, loadingDirs, childrenCache, hasMdCache, selectedFilePath, onToggle, onSelectFile, onCreateFile, onDeleteFile, onRename, onCreateFolder, renamingPath, onStartRename, onCancelRename, creatingInDir, onStartCreate, onCancelCreate, creatingFolderInDir, onStartCreateFolder, onCancelCreateFolder, dragOverPath, onMoveEntry, onDragOverPath, dragSourceRef }) => {
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
        selected={isSelected}
        sx={{
          py: 0.25,
          pl: 1 + depth * (INDENT_PX / 8),
          minHeight: 28,
          ...(empty && { cursor: "default" }),
          ...(isDragOver && {
            bgcolor: "action.hover",
            outline: "1px dashed",
            outlineColor: "primary.main",
            outlineOffset: -1,
          }),
        }}
      >
        {isDir ? (
          <ListItemIcon sx={{ minWidth: 20 }}>
            <DirExpandIcon isLoading={isLoading} empty={empty} isOpen={isOpen} emptyColor={emptyColor} />
          </ListItemIcon>
        ) : (
          <Box sx={{ width: 20 }} />
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          <EntryIcon isDir={isDir} isOpen={isOpen} empty={empty} emptyColor={emptyColor} />
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
          <ActionButtons
            isDir={isDir} empty={empty} isOpen={isOpen}
            entryPath={entry.path}
            onToggle={() => onToggle(entry)}
            onStartRename={onStartRename}
            onStartCreateFolder={onStartCreateFolder}
            onStartCreate={onStartCreate}
            onDeleteFile={onDeleteFile}
          />
        )}
      </ListItemButton>
      {isDir && (
        <Collapse in={isOpen || creatingInDir === entry.path || creatingFolderInDir === entry.path} timeout="auto" unmountOnExit>
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
