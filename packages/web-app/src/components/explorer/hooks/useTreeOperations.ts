import { useCallback } from "react";

import { createFile, deleteFile, fetchDirEntries, listAllFiles, renameFile } from "../helpers";
import type { ChildrenCache, GitHubRepo, HasMdCache, TreeEntry } from "../types";

/** エントリ配列内のパスを差し替えてソートする */
function replaceAndSortEntries(entries: TreeEntry[], oldPath: string, newPath: string, newName: string): TreeEntry[] {
  return entries.map((e) =>
    e.path === oldPath ? { ...e, path: newPath, name: newName } : e,
  ).sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** 展開状態のパスを旧パスから新パスに更新する */
function updateExpandedPaths(
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
  oldPath: string,
  newPath: string,
): void {
  setExpanded((prev) => {
    const next = new Set<string>();
    for (const p of prev) {
      if (p === oldPath) next.add(newPath);
      else if (p.startsWith(oldPath + "/")) next.add(newPath + p.slice(oldPath.length));
      else next.add(p);
    }
    return next;
  });
}

/** ディレクトリ内の全ファイルを新パスにリネームする */
async function renameDirFiles(repoFullName: string, branch: string, oldDir: string, newDir: string): Promise<boolean> {
  const allFiles = await listAllFiles(repoFullName, branch, oldDir);
  if (allFiles.length === 0) return false;
  for (const filePath of allFiles) {
    const suffix = filePath.slice(oldDir.length);
    const ok = await renameFile(repoFullName, filePath, newDir + suffix, branch);
    if (!ok) return false;
  }
  return true;
}

/** 移動後のキャッシュを更新する */
function updateCacheAfterMove(
  childrenCache: Map<string, TreeEntry[]>,
  hasMdCache: Map<string, boolean>,
  srcDir: string,
  targetDir: string,
  sourcePath: string,
  entry: TreeEntry,
  newPath: string,
  isDir: boolean,
): void {
  const srcEntries = childrenCache.get(srcDir) ?? [];
  const updatedSrc = srcEntries.filter((e) => e.path !== sourcePath);
  childrenCache.set(srcDir, updatedSrc);
  if (!updatedSrc.some((e) => e.type === "blob")) {
    hasMdCache.set(srcDir, updatedSrc.some((e) => e.type === "tree" && hasMdCache.get(e.path) === true));
  }
  const movedEntry: TreeEntry = { ...entry, path: newPath };
  const targetEntries = childrenCache.get(targetDir) ?? [];
  childrenCache.set(targetDir, [...targetEntries, movedEntry].sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.name.localeCompare(b.name);
  }));
  if (!isDir) hasMdCache.set(targetDir, true);
  if (isDir) {
    childrenCache.delete(sourcePath);
    hasMdCache.delete(sourcePath);
  }
}

/** 移動後の選択中ファイルパスを更新する */
function updateSelectedPathAfterMove(
  selectedFilePath: string | null,
  sourcePath: string,
  newPath: string,
  isDir: boolean,
  setSelectedFilePath: (path: string | null) => void,
): void {
  if (selectedFilePath === sourcePath) {
    setSelectedFilePath(newPath);
  } else if (isDir && selectedFilePath?.startsWith(sourcePath + "/")) {
    setSelectedFilePath(newPath + selectedFilePath.slice(sourcePath.length));
  }
}

interface UseTreeOperationsArgs {
  selectedRepo: GitHubRepo | null;
  selectedBranch: string;
  selectedFilePath: string | null;
  setSelectedFilePath: (path: string | null) => void;
  setCommits: (commits: []) => void;
  setSelectedSha: (sha: string | null) => void;
  rootEntries: TreeEntry[];
  setRootEntries: (entries: TreeEntry[]) => void;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLoadingDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCreatingInDir: (path: string | null) => void;
  setCreatingFolderInDir: (path: string | null) => void;
  setRenamingPath: (path: string | null) => void;
  childrenCacheRef: React.MutableRefObject<ChildrenCache>;
  hasMdCacheRef: React.MutableRefObject<HasMdCache>;
  bumpCache: () => void;
  handleFileSelect: (filePath: string) => void;
}

/** フォルダ内の全ファイルを削除し、キャッシュと展開状態をクリーンアップ */
async function deleteFolderContents(
  repoFullName: string,
  branch: string,
  targetPath: string,
  childrenCache: ChildrenCache,
  hasMdCache: HasMdCache,
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
): Promise<boolean> {
  const allFiles = await listAllFiles(repoFullName, branch, targetPath);
  for (const fp of allFiles) {
    const ok = await deleteFile(repoFullName, fp, branch);
    if (!ok) return false;
  }
  childrenCache.delete(targetPath);
  hasMdCache.delete(targetPath);
  setExpanded((prev) => {
    const next = new Set<string>();
    for (const p of prev) {
      if (p !== targetPath && !p.startsWith(targetPath + "/")) next.add(p);
    }
    return next;
  });
  return true;
}

/** 親キャッシュからエントリを削除して hasMd を再計算 */
function removeEntryFromCache(
  dirPath: string,
  targetPath: string,
  parentEntries: TreeEntry[],
  childrenCache: ChildrenCache,
  hasMdCache: HasMdCache,
  setRootEntries: (entries: TreeEntry[]) => void,
): void {
  const updated = parentEntries.filter((e) => e.path !== targetPath);
  childrenCache.set(dirPath, updated);
  if (!updated.some((e) => e.type === "blob")) {
    hasMdCache.set(dirPath, updated.some((e) => e.type === "tree" && hasMdCache.get(e.path) === true));
  }
  if (dirPath === "") {
    setRootEntries([...updated]);
  }
}

export function useTreeOperations({
  selectedRepo,
  selectedBranch,
  selectedFilePath,
  setSelectedFilePath,
  setCommits,
  setSelectedSha,
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
}: UseTreeOperationsArgs) {
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
    [bumpCache, childrenCacheRef, hasMdCacheRef],
  );

  const loadTree = useCallback(
    async (repo: GitHubRepo, branch: string) => {
      setExpanded(new Set());
      setSelectedFilePath(null);
      setCommits([]);
      setSelectedSha(null);
      setCreatingInDir(null);
      childrenCacheRef.current = new Map();
      hasMdCacheRef.current = new Map();
      const entries = await fetchDirEntries(repo.fullName, branch, "");
      childrenCacheRef.current.set("", entries);
      setRootEntries(entries);

      const subDirs = entries.filter((e) => e.type === "tree");
      subDirs.forEach((d) => prefetchSubtree(repo, branch, d.path));
    },
    [prefetchSubtree, setExpanded, setSelectedFilePath, setCommits, setSelectedSha, setCreatingInDir, childrenCacheRef, hasMdCacheRef, setRootEntries],
  );

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
    [selectedRepo, selectedBranch, expanded, prefetchSubtree, setExpanded, setLoadingDirs, childrenCacheRef],
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
    [selectedRepo, selectedBranch, bumpCache, handleFileSelect, setCreatingInDir, childrenCacheRef, hasMdCacheRef, setRootEntries],
  );

  const handleDeleteFile = useCallback(
    async (targetPath: string) => {
      if (!selectedRepo) return;

      const dirPath = targetPath.includes("/") ? targetPath.slice(0, targetPath.lastIndexOf("/")) : "";
      const parentEntries = childrenCacheRef.current.get(dirPath) ?? [];
      const entry = parentEntries.find((e) => e.path === targetPath);
      const isDir = entry?.type === "tree";

      const name = targetPath.split("/").pop();
      if (!window.confirm(isDir ? `Delete folder "${name}" and all its contents?` : `Delete "${name}"?`)) return;

      if (isDir) {
        const allOk = await deleteFolderContents(
          selectedRepo.fullName, selectedBranch, targetPath,
          childrenCacheRef.current, hasMdCacheRef.current, setExpanded,
        );
        if (!allOk) return;
      } else {
        const ok = await deleteFile(selectedRepo.fullName, targetPath, selectedBranch);
        if (!ok) return;
      }

      removeEntryFromCache(dirPath, targetPath, parentEntries, childrenCacheRef.current, hasMdCacheRef.current, setRootEntries);
      bumpCache();

      // 削除対象が選択中なら選択解除
      if (selectedFilePath === targetPath || (isDir && selectedFilePath?.startsWith(targetPath + "/"))) {
        setSelectedFilePath(null);
        setCommits([]);
        setSelectedSha(null);
      }
    },
    [selectedRepo, selectedBranch, selectedFilePath, bumpCache, setExpanded, setSelectedFilePath, setCommits, setSelectedSha, childrenCacheRef, hasMdCacheRef, setRootEntries],
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
    [selectedRepo, selectedBranch, bumpCache, setCreatingFolderInDir, childrenCacheRef, hasMdCacheRef, setRootEntries],
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
        const allFiles = await listAllFiles(selectedRepo.fullName, selectedBranch, oldPath);
        if (allFiles.length === 0) return;

        let allOk = true;
        for (const filePath of allFiles) {
          const ok = await renameFile(selectedRepo.fullName, filePath, newPath + filePath.slice(oldPath.length), selectedBranch);
          if (!ok) { allOk = false; break; }
        }
        if (!allOk) return;

        const updated = replaceAndSortEntries(entries, oldPath, newPath, newName);
        childrenCacheRef.current.set(dirPath, updated);
        childrenCacheRef.current.delete(oldPath);
        hasMdCacheRef.current.delete(oldPath);
        if (dirPath === "") setRootEntries([...updated]);
        updateExpandedPaths(setExpanded, oldPath, newPath);
      } else {
        const ok = await renameFile(selectedRepo.fullName, oldPath, newPath, selectedBranch);
        if (!ok) return;

        const updated = replaceAndSortEntries(entries, oldPath, newPath, newName);
        childrenCacheRef.current.set(dirPath, updated);
        if (selectedFilePath === oldPath) setSelectedFilePath(newPath);
      }

      if (dirPath === "") {
        setRootEntries([...childrenCacheRef.current.get("") ?? []]);
      }
      bumpCache();
    },
    [selectedRepo, selectedBranch, selectedFilePath, bumpCache, setRenamingPath, setExpanded, setSelectedFilePath, childrenCacheRef, hasMdCacheRef, setRootEntries],
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

      const renameOk = isDir
        ? await renameDirFiles(selectedRepo.fullName, selectedBranch, sourcePath, newPath)
        : await renameFile(selectedRepo.fullName, sourcePath, newPath, selectedBranch);
      if (!renameOk) return;

      updateCacheAfterMove(childrenCacheRef.current, hasMdCacheRef.current, srcDir, targetDir, sourcePath, entry, newPath, isDir);
      updateSelectedPathAfterMove(selectedFilePath, sourcePath, newPath, isDir, setSelectedFilePath);
      if (isDir) updateExpandedPaths(setExpanded, sourcePath, newPath);

      if (srcDir === "" || targetDir === "") {
        setRootEntries([...childrenCacheRef.current.get("") ?? []]);
      }
      bumpCache();
    },
    [selectedRepo, selectedBranch, selectedFilePath, bumpCache, setExpanded, setSelectedFilePath, childrenCacheRef, hasMdCacheRef, setRootEntries],
  );

  return {
    prefetchSubtree,
    loadTree,
    handleToggle,
    handleCreateFile,
    handleDeleteFile,
    handleCreateFolder,
    handleRename,
    handleMoveEntry,
  };
}
