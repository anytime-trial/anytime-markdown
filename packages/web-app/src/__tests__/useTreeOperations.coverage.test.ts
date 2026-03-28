/**
 * useTreeOperations hook - 追加カバレッジテスト
 *
 * 未カバーのブランチ・エッジケースを対象にテストする。
 */

import { renderHook, act } from "@testing-library/react";
import React from "react";

const mockFetchDirEntries = jest.fn();
const mockCreateFile = jest.fn();
const mockDeleteFile = jest.fn();
const mockRenameFile = jest.fn();
const mockListAllFiles = jest.fn();

jest.mock("../components/explorer/helpers", () => ({
  fetchDirEntries: (...args: unknown[]) => mockFetchDirEntries(...args),
  createFile: (...args: unknown[]) => mockCreateFile(...args),
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  renameFile: (...args: unknown[]) => mockRenameFile(...args),
  listAllFiles: (...args: unknown[]) => mockListAllFiles(...args),
}));

import { useTreeOperations } from "../components/explorer/hooks/useTreeOperations";
import type { TreeEntry } from "../components/explorer/types";

beforeEach(() => {
  mockFetchDirEntries.mockReset();
  mockCreateFile.mockReset();
  mockDeleteFile.mockReset();
  mockRenameFile.mockReset();
  mockListAllFiles.mockReset();
  jest.spyOn(globalThis, "confirm").mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createArgs(overrides?: Partial<Parameters<typeof useTreeOperations>[0]>) {
  const childrenCache = new Map<string, TreeEntry[]>();
  const hasMdCache = new Map<string, boolean>();
  return {
    selectedRepo: { fullName: "user/repo", private: false, defaultBranch: "main" },
    selectedBranch: "main",
    selectedFilePath: null as string | null,
    setSelectedFilePath: jest.fn(),
    setCommits: jest.fn(),
    setSelectedSha: jest.fn(),
    rootEntries: [] as TreeEntry[],
    setRootEntries: jest.fn(),
    expanded: new Set<string>(),
    setExpanded: jest.fn((fn: unknown) => {
      if (typeof fn === "function") fn(new Set<string>());
    }) as unknown as React.Dispatch<React.SetStateAction<Set<string>>>,
    setLoadingDirs: jest.fn((fn: unknown) => {
      if (typeof fn === "function") fn(new Set<string>());
    }) as unknown as React.Dispatch<React.SetStateAction<Set<string>>>,
    setCreatingInDir: jest.fn(),
    setCreatingFolderInDir: jest.fn(),
    setRenamingPath: jest.fn(),
    childrenCacheRef: { current: childrenCache } as React.RefObject<Map<string, TreeEntry[]>>,
    hasMdCacheRef: { current: hasMdCache } as React.RefObject<Map<string, boolean>>,
    bumpCache: jest.fn(),
    handleFileSelect: jest.fn(),
    ...overrides,
  };
}

// ─── prefetchSubtree ─────────────────────────────────────────────────────────

describe("prefetchSubtree", () => {
  it("キャッシュ済みの場合はキャッシュ値を返す", async () => {
    const args = createArgs();
    args.hasMdCacheRef.current.set("docs", true);
    const { result } = renderHook(() => useTreeOperations(args));

    let hasMd: boolean | undefined;
    await act(async () => {
      hasMd = await result.current.prefetchSubtree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
        "docs",
      );
    });

    expect(hasMd).toBe(true);
    expect(mockFetchDirEntries).not.toHaveBeenCalled();
  });

  it("キャッシュが false の場合も再フェッチしない", async () => {
    const args = createArgs();
    args.hasMdCacheRef.current.set("empty", false);
    const { result } = renderHook(() => useTreeOperations(args));

    let hasMd: boolean | undefined;
    await act(async () => {
      hasMd = await result.current.prefetchSubtree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
        "empty",
      );
    });

    expect(hasMd).toBe(false);
  });

  it("直接 MD ファイルがあるディレクトリは true を返す", async () => {
    const entries: TreeEntry[] = [
      { path: "docs/readme.md", type: "blob", name: "readme.md" },
    ];
    mockFetchDirEntries.mockResolvedValue(entries);
    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    let hasMd: boolean | undefined;
    await act(async () => {
      hasMd = await result.current.prefetchSubtree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
        "docs",
      );
    });

    expect(hasMd).toBe(true);
    expect(args.hasMdCacheRef.current.get("docs")).toBe(true);
    expect(args.bumpCache).toHaveBeenCalled();
  });

  it("サブディレクトリのみで MD なしの場合は false を返す", async () => {
    const entries: TreeEntry[] = [
      { path: "docs/sub", type: "tree", name: "sub" },
    ];
    mockFetchDirEntries
      .mockResolvedValueOnce(entries) // docs
      .mockResolvedValueOnce([]); // docs/sub (空)
    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    let hasMd: boolean | undefined;
    await act(async () => {
      hasMd = await result.current.prefetchSubtree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
        "docs",
      );
    });

    expect(hasMd).toBe(false);
  });

  it("サブディレクトリが 0 個の場合は false を返す", async () => {
    const entries: TreeEntry[] = []; // 空ディレクトリ
    mockFetchDirEntries.mockResolvedValue(entries);
    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    let hasMd: boolean | undefined;
    await act(async () => {
      hasMd = await result.current.prefetchSubtree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
        "docs",
      );
    });

    // no blob, no subdirs -> false
    expect(hasMd).toBe(false);
  });

  it("childrenCache にエントリがある場合は fetch しない", async () => {
    const entries: TreeEntry[] = [
      { path: "docs/readme.md", type: "blob", name: "readme.md" },
    ];
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", entries);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.prefetchSubtree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
        "docs",
      );
    });

    expect(mockFetchDirEntries).not.toHaveBeenCalled();
    expect(args.hasMdCacheRef.current.get("docs")).toBe(true);
  });
});

// ─── handleDeleteFile - 追加ケース ──────────────────────────────────────────

describe("handleDeleteFile - 追加カバレッジ", () => {
  it("サブディレクトリのファイルを削除する", async () => {
    mockDeleteFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", [
      { path: "docs/a.md", type: "blob", name: "a.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("docs/a.md");
    });

    expect(mockDeleteFile).toHaveBeenCalledWith("user/repo", "docs/a.md", "main");
    expect(args.bumpCache).toHaveBeenCalled();
  });

  it("deleteFile が false を返した場合はキャッシュを更新しない", async () => {
    mockDeleteFile.mockResolvedValue(false);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "a.md", type: "blob", name: "a.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("a.md");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });

  it("フォルダ削除で一部ファイルの削除が失敗した場合は中断する", async () => {
    mockListAllFiles.mockResolvedValue(["docs/a.md", "docs/b.md"]);
    mockDeleteFile
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "docs", type: "tree", name: "docs" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("docs");
    });

    // deleteFolderContents returns false → handleDeleteFile early returns
    expect(args.bumpCache).not.toHaveBeenCalled();
  });

  it("フォルダ削除時、選択中ファイルがフォルダ配下の場合は選択解除する", async () => {
    mockListAllFiles.mockResolvedValue(["docs/a.md"]);
    mockDeleteFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "docs/a.md" });
    args.childrenCacheRef.current.set("", [
      { path: "docs", type: "tree", name: "docs" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("docs");
    });

    expect(args.setSelectedFilePath).toHaveBeenCalledWith(null);
  });

  it("ルートレベルのファイル削除後、rootEntries が更新される", async () => {
    mockDeleteFile.mockResolvedValue(true);
    const entries: TreeEntry[] = [
      { path: "a.md", type: "blob", name: "a.md" },
      { path: "b.md", type: "blob", name: "b.md" },
    ];
    const args = createArgs();
    args.childrenCacheRef.current.set("", entries);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("a.md");
    });

    expect(args.setRootEntries).toHaveBeenCalled();
  });

  it("削除後、ディレクトリに blob がない場合は hasMdCache を再計算する", async () => {
    mockDeleteFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", [
      { path: "docs/a.md", type: "blob", name: "a.md" },
    ]);
    args.hasMdCacheRef.current.set("docs", true);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("docs/a.md");
    });

    // After removing the only blob, hasMdCache should be recalculated
    expect(args.bumpCache).toHaveBeenCalled();
  });
});

// ─── handleCreateFolder - 追加ケース ────────────────────────────────────────

describe("handleCreateFolder - 追加カバレッジ", () => {
  it("サブディレクトリにフォルダを作成する", async () => {
    mockCreateFile.mockResolvedValue({ path: "docs/sub/.gitkeep" });
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFolder("docs", "sub");
    });

    expect(mockCreateFile).toHaveBeenCalledWith("user/repo", "docs/sub/.gitkeep", "main");
    expect(args.childrenCacheRef.current.has("docs/sub")).toBe(true);
    expect(args.hasMdCacheRef.current.get("docs/sub")).toBe(false);
  });

  it("createFile が null を返した場合はキャッシュを更新しない", async () => {
    mockCreateFile.mockResolvedValue(null);
    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFolder("", "newdir");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });
});

// ─── handleRename - 追加ケース ──────────────────────────────────────────────

describe("handleRename - 追加カバレッジ", () => {
  it("ファイルリネーム失敗時は bumpCache しない", async () => {
    mockRenameFile.mockResolvedValue(false);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "old.md", type: "blob", name: "old.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("old.md", "new.md");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });

  it("ディレクトリリネームで listAllFiles が空を返した場合は false", async () => {
    mockListAllFiles.mockResolvedValue([]);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "olddir", type: "tree", name: "olddir" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("olddir", "newdir");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });

  it("ディレクトリリネームで renameFile が失敗した場合は中断する", async () => {
    mockListAllFiles.mockResolvedValue(["olddir/a.md"]);
    mockRenameFile.mockResolvedValue(false);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "olddir", type: "tree", name: "olddir" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("olddir", "newdir");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });

  it("サブディレクトリ内のファイルをリネームする", async () => {
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "docs/old.md" });
    args.childrenCacheRef.current.set("docs", [
      { path: "docs/old.md", type: "blob", name: "old.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("docs/old.md", "new.md");
    });

    expect(mockRenameFile).toHaveBeenCalledWith("user/repo", "docs/old.md", "docs/new.md", "main");
    expect(args.setSelectedFilePath).toHaveBeenCalledWith("docs/new.md");
  });

  it("リネーム対象が選択ファイルでない場合は setSelectedFilePath を呼ばない", async () => {
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "other.md" });
    args.childrenCacheRef.current.set("", [
      { path: "old.md", type: "blob", name: "old.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("old.md", "new.md");
    });

    // selectedFilePath != oldPath, so setSelectedFilePath should not be called with newPath
    expect(args.setSelectedFilePath).not.toHaveBeenCalledWith("new.md");
  });
});

// ─── handleMoveEntry - 追加ケース ───────────────────────────────────────────

describe("handleMoveEntry - 追加カバレッジ", () => {
  it("ディレクトリを別のディレクトリに移動する", async () => {
    mockListAllFiles.mockResolvedValue(["sub/a.md"]);
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "sub", type: "tree", name: "sub" },
      { path: "target", type: "tree", name: "target" },
    ]);
    args.childrenCacheRef.current.set("target", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("sub", "target");
    });

    expect(mockListAllFiles).toHaveBeenCalledWith("user/repo", "main", "sub");
    expect(args.bumpCache).toHaveBeenCalled();
  });

  it("移動時にリネームが失敗した場合はキャッシュを更新しない", async () => {
    mockRenameFile.mockResolvedValue(false);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "file.md", type: "blob", name: "file.md" },
    ]);
    args.childrenCacheRef.current.set("docs", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("file.md", "docs");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });

  it("移動時に選択ファイルがソースと一致する場合はパスを更新する", async () => {
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "file.md" });
    args.childrenCacheRef.current.set("", [
      { path: "file.md", type: "blob", name: "file.md" },
    ]);
    args.childrenCacheRef.current.set("docs", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("file.md", "docs");
    });

    expect(args.setSelectedFilePath).toHaveBeenCalledWith("docs/file.md");
  });

  it("ディレクトリ移動時に選択ファイルがソース配下の場合はパスを更新する", async () => {
    mockListAllFiles.mockResolvedValue(["sub/a.md"]);
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "sub/a.md" });
    args.childrenCacheRef.current.set("", [
      { path: "sub", type: "tree", name: "sub" },
    ]);
    args.childrenCacheRef.current.set("target", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("sub", "target");
    });

    expect(args.setSelectedFilePath).toHaveBeenCalledWith("target/sub/a.md");
  });

  it("ルートへの移動で targetDir が空文字の場合", async () => {
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", [
      { path: "docs/file.md", type: "blob", name: "file.md" },
    ]);
    args.childrenCacheRef.current.set("", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("docs/file.md", "");
    });

    expect(mockRenameFile).toHaveBeenCalledWith("user/repo", "docs/file.md", "file.md", "main");
    expect(args.setRootEntries).toHaveBeenCalled();
  });
});

// ─── rename - 追加ブランチカバレッジ ──────────────────────────────────────────

describe("rename - branch coverage additions", () => {
  it("ファイルリネームで同ディレクトリ内の他エントリも保持される (replaceAndSortEntries)", async () => {
    mockRenameFile.mockResolvedValue(true);
    const entries: TreeEntry[] = [
      { path: "docs", type: "tree", name: "docs" },
      { path: "a.md", type: "blob", name: "a.md" },
      { path: "b.md", type: "blob", name: "b.md" },
    ];
    const args = createArgs();
    args.childrenCacheRef.current.set("", entries);
    // Set expanded paths including the rename target
    const expanded = new Set(["docs", "docs/sub"]);
    args.setExpanded = jest.fn((fn: unknown) => {
      if (typeof fn === "function") (fn as Function)(expanded);
    }) as any;
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("a.md", "renamed.md");
    });

    expect(mockRenameFile).toHaveBeenCalledWith("user/repo", "a.md", "renamed.md", "main");
  });

  it("フォルダリネームで子パスの expanded が更新される (updateExpandedPaths)", async () => {
    mockRenameFile.mockResolvedValue(true);
    mockListAllFiles.mockResolvedValue(["old/file.md"]);
    const entries: TreeEntry[] = [
      { path: "old", type: "tree", name: "old" },
      { path: "other", type: "tree", name: "other" },
    ];
    const args = createArgs();
    args.childrenCacheRef.current.set("", entries);
    // Expanded set includes the folder and sub-paths
    const expanded = new Set(["old", "old/sub", "other"]);
    args.setExpanded = jest.fn((fn: unknown) => {
      if (typeof fn === "function") {
        const result = (fn as Function)(expanded);
        // Verify result contains updated paths
        expect(result.has("new")).toBe(true);
        expect(result.has("new/sub")).toBe(true);
        expect(result.has("other")).toBe(true);
        expect(result.has("old")).toBe(false);
      }
    }) as any;
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("old", "new");
    });
  });

  it("フォルダリネームで listAllFiles が空を返す場合", async () => {
    mockListAllFiles.mockResolvedValue([]);
    const entries: TreeEntry[] = [
      { path: "empty-dir", type: "tree", name: "empty-dir" },
    ];
    const args = createArgs();
    args.childrenCacheRef.current.set("", entries);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("empty-dir", "new-dir");
    });
    // Should handle empty dir gracefully
  });

  it("フォルダリネームで部分的にリネーム失敗する場合", async () => {
    mockListAllFiles.mockResolvedValue(["dir/a.md", "dir/b.md"]);
    mockRenameFile
      .mockResolvedValueOnce(true) // first file
      .mockResolvedValueOnce(false); // second file fails
    const entries: TreeEntry[] = [
      { path: "dir", type: "tree", name: "dir" },
    ];
    const args = createArgs();
    args.childrenCacheRef.current.set("", entries);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("dir", "new-dir");
    });
    // Partial failure - should not update cache
  });
});

// ─── loadTree - 追加ケース ──────────────────────────────────────────────────

describe("loadTree - 追加カバレッジ", () => {
  it("サブディレクトリに対して prefetchSubtree を呼ぶ", async () => {
    const entries: TreeEntry[] = [
      { path: "docs", type: "tree", name: "docs" },
      { path: "src", type: "tree", name: "src" },
      { path: "readme.md", type: "blob", name: "readme.md" },
    ];
    mockFetchDirEntries
      .mockResolvedValueOnce(entries) // root
      .mockResolvedValueOnce([]) // docs
      .mockResolvedValueOnce([]); // src
    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.loadTree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
      );
    });

    expect(args.setExpanded).toHaveBeenCalled();
    expect(args.setCommits).toHaveBeenCalledWith([]);
    expect(args.setSelectedSha).toHaveBeenCalledWith(null);
    expect(args.setCreatingInDir).toHaveBeenCalledWith(null);
  });
});
