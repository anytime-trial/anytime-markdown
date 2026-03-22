/**
 * useTreeOperations hook のユニットテスト
 *
 * helpers をモックし、ツリー操作の主要な動作を検証する。
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

// ─── loadTree ────────────────────────────────────────────────────────────────

describe("loadTree", () => {
  it("ルートエントリを取得してキャッシュに設定する", async () => {
    const entries: TreeEntry[] = [
      { path: "README.md", type: "blob", name: "README.md" },
      { path: "docs", type: "tree", name: "docs" },
    ];
    mockFetchDirEntries.mockResolvedValue(entries);

    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.loadTree(
        { fullName: "user/repo", private: false, defaultBranch: "main" },
        "main",
      );
    });

    expect(args.setRootEntries).toHaveBeenCalledWith(entries);
    expect(args.childrenCacheRef.current.get("")).toEqual(entries);
    expect(args.setSelectedFilePath).toHaveBeenCalledWith(null);
  });
});

// ─── handleToggle ────────────────────────────────────────────────────────────

describe("handleToggle", () => {
  it("未展開のディレクトリを展開する", async () => {
    const dirEntry: TreeEntry = { path: "docs", type: "tree", name: "docs" };
    const children: TreeEntry[] = [{ path: "docs/a.md", type: "blob", name: "a.md" }];
    mockFetchDirEntries.mockResolvedValue(children);

    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleToggle(dirEntry);
    });

    expect(args.childrenCacheRef.current.get("docs")).toEqual(children);
    expect(args.setExpanded).toHaveBeenCalled();
  });

  it("展開済みのディレクトリを折りたたむ", async () => {
    const dirEntry: TreeEntry = { path: "docs", type: "tree", name: "docs" };
    const args = createArgs({ expanded: new Set(["docs"]) });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleToggle(dirEntry);
    });

    // setExpanded が呼ばれ、削除の関数が渡される
    expect(args.setExpanded).toHaveBeenCalled();
  });

  it("selectedRepo が null の場合は何もしない", async () => {
    const dirEntry: TreeEntry = { path: "docs", type: "tree", name: "docs" };
    const args = createArgs({ selectedRepo: null });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleToggle(dirEntry);
    });

    expect(mockFetchDirEntries).not.toHaveBeenCalled();
  });

  it("キャッシュ済みの場合は fetch しない", async () => {
    const dirEntry: TreeEntry = { path: "docs", type: "tree", name: "docs" };
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleToggle(dirEntry);
    });

    expect(mockFetchDirEntries).not.toHaveBeenCalled();
  });
});

// ─── handleCreateFile ────────────────────────────────────────────────────────

describe("handleCreateFile", () => {
  it("ファイルを作成しキャッシュに追加する", async () => {
    mockCreateFile.mockResolvedValue({ path: "new.md" });
    const args = createArgs();
    args.childrenCacheRef.current.set("", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFile("", "new.md");
    });

    expect(mockCreateFile).toHaveBeenCalledWith("user/repo", "new.md", "main");
    expect(args.setCreatingInDir).toHaveBeenCalledWith(null);
    expect(args.bumpCache).toHaveBeenCalled();
    expect(args.handleFileSelect).toHaveBeenCalledWith("new.md");
  });

  it("サブディレクトリにファイルを作成する", async () => {
    mockCreateFile.mockResolvedValue({ path: "docs/test.md" });
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFile("docs", "test.md");
    });

    expect(mockCreateFile).toHaveBeenCalledWith("user/repo", "docs/test.md", "main");
  });

  it("selectedRepo が null の場合は何もしない", async () => {
    const args = createArgs({ selectedRepo: null });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFile("", "new.md");
    });

    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  it("createFile が null を返した場合はキャッシュを更新しない", async () => {
    mockCreateFile.mockResolvedValue(null);
    const args = createArgs();
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFile("", "fail.md");
    });

    expect(args.bumpCache).not.toHaveBeenCalled();
  });
});

// ─── handleDeleteFile ────────────────────────────────────────────────────────

describe("handleDeleteFile", () => {
  it("ファイルを削除しキャッシュから除去する", async () => {
    mockDeleteFile.mockResolvedValue(true);
    const args = createArgs();
    const entries: TreeEntry[] = [
      { path: "a.md", type: "blob", name: "a.md" },
      { path: "b.md", type: "blob", name: "b.md" },
    ];
    args.childrenCacheRef.current.set("", entries);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("a.md");
    });

    expect(mockDeleteFile).toHaveBeenCalledWith("user/repo", "a.md", "main");
    expect(args.bumpCache).toHaveBeenCalled();
  });

  it("削除対象が選択中ファイルの場合は選択解除する", async () => {
    mockDeleteFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "target.md" });
    args.childrenCacheRef.current.set("", [{ path: "target.md", type: "blob", name: "target.md" }]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("target.md");
    });

    expect(args.setSelectedFilePath).toHaveBeenCalledWith(null);
    expect(args.setCommits).toHaveBeenCalledWith([]);
    expect(args.setSelectedSha).toHaveBeenCalledWith(null);
  });

  it("confirm がキャンセルされた場合は削除しない", async () => {
    jest.spyOn(globalThis, "confirm").mockReturnValue(false);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [{ path: "a.md", type: "blob", name: "a.md" }]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("a.md");
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("selectedRepo が null の場合は何もしない", async () => {
    const args = createArgs({ selectedRepo: null });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("a.md");
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("フォルダを削除する場合は全ファイルを削除する", async () => {
    mockListAllFiles.mockResolvedValue(["docs/a.md", "docs/b.md"]);
    mockDeleteFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [{ path: "docs", type: "tree", name: "docs" }]);
    args.childrenCacheRef.current.set("docs", [
      { path: "docs/a.md", type: "blob", name: "a.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleDeleteFile("docs");
    });

    expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    expect(args.bumpCache).toHaveBeenCalled();
  });
});

// ─── handleCreateFolder ─────────────────────────────────────────────────────

describe("handleCreateFolder", () => {
  it("フォルダを作成し .gitkeep を生成する", async () => {
    mockCreateFile.mockResolvedValue({ path: "newdir/.gitkeep" });
    const args = createArgs();
    args.childrenCacheRef.current.set("", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFolder("", "newdir");
    });

    expect(mockCreateFile).toHaveBeenCalledWith("user/repo", "newdir/.gitkeep", "main");
    expect(args.setCreatingFolderInDir).toHaveBeenCalledWith(null);
    expect(args.bumpCache).toHaveBeenCalled();
    // キャッシュにフォルダが追加されたか確認
    const rootEntries = args.childrenCacheRef.current.get("");
    expect(rootEntries?.some((e) => e.path === "newdir" && e.type === "tree")).toBe(true);
  });

  it("selectedRepo が null の場合は何もしない", async () => {
    const args = createArgs({ selectedRepo: null });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleCreateFolder("", "newdir");
    });

    expect(mockCreateFile).not.toHaveBeenCalled();
  });
});

// ─── handleRename ────────────────────────────────────────────────────────────

describe("handleRename", () => {
  it("ファイルをリネームしキャッシュを更新する", async () => {
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs({ selectedFilePath: "old.md" });
    args.childrenCacheRef.current.set("", [
      { path: "old.md", type: "blob", name: "old.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("old.md", "new.md");
    });

    expect(mockRenameFile).toHaveBeenCalledWith("user/repo", "old.md", "new.md", "main");
    expect(args.setRenamingPath).toHaveBeenCalledWith(null);
    expect(args.bumpCache).toHaveBeenCalled();
    expect(args.setSelectedFilePath).toHaveBeenCalledWith("new.md");
  });

  it("ディレクトリをリネームする場合は全ファイルをリネームする", async () => {
    mockListAllFiles.mockResolvedValue(["olddir/a.md"]);
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "olddir", type: "tree", name: "olddir" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("olddir", "newdir");
    });

    expect(mockRenameFile).toHaveBeenCalledWith("user/repo", "olddir/a.md", "newdir/a.md", "main");
    expect(args.bumpCache).toHaveBeenCalled();
  });

  it("selectedRepo が null の場合は何もしない", async () => {
    const args = createArgs({ selectedRepo: null });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("old.md", "new.md");
    });

    expect(mockRenameFile).not.toHaveBeenCalled();
  });

  it("エントリが見つからない場合は何もしない", async () => {
    const args = createArgs();
    args.childrenCacheRef.current.set("", []); // 空
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleRename("nonexistent.md", "new.md");
    });

    expect(mockRenameFile).not.toHaveBeenCalled();
  });
});

// ─── handleMoveEntry ─────────────────────────────────────────────────────────

describe("handleMoveEntry", () => {
  it("ファイルを別ディレクトリに移動する", async () => {
    mockRenameFile.mockResolvedValue(true);
    const args = createArgs();
    args.childrenCacheRef.current.set("", [
      { path: "file.md", type: "blob", name: "file.md" },
    ]);
    args.childrenCacheRef.current.set("docs", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("file.md", "docs");
    });

    expect(mockRenameFile).toHaveBeenCalledWith("user/repo", "file.md", "docs/file.md", "main");
    expect(args.bumpCache).toHaveBeenCalled();
  });

  it("同じディレクトリへの移動は何もしない", async () => {
    const args = createArgs();
    args.childrenCacheRef.current.set("docs", [
      { path: "docs/file.md", type: "blob", name: "file.md" },
    ]);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("docs/file.md", "docs");
    });

    expect(mockRenameFile).not.toHaveBeenCalled();
  });

  it("selectedRepo が null の場合は何もしない", async () => {
    const args = createArgs({ selectedRepo: null });
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("file.md", "docs");
    });

    expect(mockRenameFile).not.toHaveBeenCalled();
  });

  it("エントリが見つからない場合は何もしない", async () => {
    const args = createArgs();
    args.childrenCacheRef.current.set("", []);
    const { result } = renderHook(() => useTreeOperations(args));

    await act(async () => {
      await result.current.handleMoveEntry("missing.md", "docs");
    });

    expect(mockRenameFile).not.toHaveBeenCalled();
  });
});
