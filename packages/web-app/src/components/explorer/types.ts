import type React from "react";

export interface GitHubRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  name: string;
}

export interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface ExplorerPanelProps {
  open: boolean;
  width?: number;
  onSelectFile: (repo: string, filePath: string, branch: string) => void;
  onSelectCommit?: (repo: string, filePath: string, sha: string) => void;
  onSelectCurrent?: () => void;
  isDirty?: boolean;
  newCommit?: { sha: string; message: string; author: string; date: string } | null;
}

export type ChildrenCache = Map<string, TreeEntry[]>;
export type HasMdCache = Map<string, boolean>;

export interface TreeNodeProps {
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
  dragSourceRef: React.RefObject<string | null>;
}

export const PANEL_WIDTH = 260;
export const INDENT_PX = 16;
export const PANEL_HEADER_MIN_HEIGHT = 40;
