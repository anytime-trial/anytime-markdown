import { renderHook, act, waitFor } from "@testing-library/react";

// dnd-kit モック
jest.mock("@dnd-kit/core", () => ({
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(() => ({})),
  useSensors: jest.fn(() => []),
}));
jest.mock("@dnd-kit/sortable", () => ({
  arrayMove: (arr: unknown[], from: number, to: number) => {
    const result = [...arr];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
  },
  sortableKeyboardCoordinates: jest.fn(),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// crypto.randomUUID モック
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2, 8) },
});

import { useLayoutEditor } from "../app/docs/edit/useLayoutEditor";

const mockFiles = [
  { key: "docs/folder1/test.md", name: "test.md", lastModified: "2024-01-01", size: 100 },
  { key: "docs/folder1/test2.md", name: "test2.md", lastModified: "2024-01-02", size: 200 },
];

const mockCategories = [
  {
    id: "cat-1",
    title: "Category 1",
    description: "Desc 1",
    items: [{ docKey: "docs/folder1/test.md", displayName: "Test" }],
    order: 0,
  },
  {
    id: "cat-2",
    title: "Category 2",
    description: "Desc 2",
    items: [{ docKey: "docs/folder1/test2.md", displayName: "Test 2", url: "https://example.com" }],
    order: 1,
  },
];

function setupFetchMock(overrides?: { filesOk?: boolean; layoutOk?: boolean }) {
  const opts = { filesOk: true, layoutOk: true, ...overrides };
  global.fetch = jest.fn((url: string) => {
    if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
      if (!opts.filesOk) return Promise.resolve({ ok: false, status: 500 } as Response);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ files: mockFiles }),
      } as Response);
    }
    if (typeof url === "string" && url.includes("/api/sites/layout")) {
      if (!opts.layoutOk) return Promise.resolve({ ok: false, status: 500 } as Response);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: mockCategories, siteDescription: "Test site" }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch;
}

describe("useLayoutEditor", () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("初期ロード: ファイル・カテゴリ・siteDescription を取得する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.files).toEqual(mockFiles);
    expect(result.current.categories).toHaveLength(2);
    expect(result.current.siteDescription).toBe("Test site");
    // URLリンクが復元される
    expect(result.current.urlLinks).toEqual([{ url: "https://example.com", displayName: "Test 2" }]);
  });

  test("初期ロード失敗: snackbar にエラーが表示される", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network error")));
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.snackbar).toEqual({
      message: "sitesLoadError",
      severity: "error",
    });
  });

  test("handleAddCategory: カテゴリを追加する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevCount = result.current.categories.length;
    act(() => result.current.handleAddCategory());
    expect(result.current.categories.length).toBe(prevCount + 1);
    const added = result.current.categories[result.current.categories.length - 1];
    expect(added.title).toBe("");
    expect(added.items).toEqual([]);
  });

  test("handleDeleteCategory: カテゴリを削除する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleDeleteCategory("cat-1"));
    expect(result.current.categories.find((c) => c.id === "cat-1")).toBeUndefined();
  });

  test("handleRemoveItem: カテゴリからアイテムを除外する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleRemoveItem("cat-1", "docs/folder1/test.md"));
    const cat1 = result.current.categories.find((c) => c.id === "cat-1");
    expect(cat1?.items).toHaveLength(0);
  });

  test("handleUpdateField: カテゴリのフィールドを更新する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleUpdateField("cat-1", "title", "New Title"));
    expect(result.current.categories.find((c) => c.id === "cat-1")?.title).toBe("New Title");

    act(() => result.current.handleUpdateField("cat-1", "description", "New Desc"));
    expect(result.current.categories.find((c) => c.id === "cat-1")?.description).toBe("New Desc");
  });

  test("handleUpdateItemDisplayName: アイテムの表示名を更新する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleUpdateItemDisplayName("cat-1", "docs/folder1/test.md", "Renamed"));
    const item = result.current.categories.find((c) => c.id === "cat-1")?.items[0];
    expect(item?.displayName).toBe("Renamed");
  });

  test("handleDropFile: カテゴリにファイルをドロップする", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleDropFile("cat-1", "docs/new/file.md", "file.md"));
    const cat1 = result.current.categories.find((c) => c.id === "cat-1");
    expect(cat1?.items).toHaveLength(2);
    expect(cat1?.items[1].docKey).toBe("docs/new/file.md");
    expect(cat1?.items[1].displayName).toBe("file");
  });

  test("handleDropFile: 重複ファイルは追加しない", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleDropFile("cat-1", "docs/folder1/test.md", "test.md"));
    const cat1 = result.current.categories.find((c) => c.id === "cat-1");
    expect(cat1?.items).toHaveLength(1);
  });

  test("handleDropUrl: カテゴリにURLをドロップする", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleDropUrl("cat-1", "https://new.example.com", "New Link"));
    const cat1 = result.current.categories.find((c) => c.id === "cat-1");
    const urlItem = cat1?.items.find((i) => i.docKey === "url:https://new.example.com");
    expect(urlItem).toBeDefined();
    expect(urlItem?.displayName).toBe("New Link");
    expect(urlItem?.url).toBe("https://new.example.com");
  });

  test("handleAddUrlLink / handleDeleteUrlLink", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleAddUrlLink("https://added.example.com", "Added"));
    expect(result.current.urlLinks).toContainEqual({ url: "https://added.example.com", displayName: "Added" });

    // 重複は追加されない
    act(() => result.current.handleAddUrlLink("https://added.example.com", "Added Again"));
    expect(result.current.urlLinks.filter((l) => l.url === "https://added.example.com")).toHaveLength(1);

    act(() => result.current.handleDeleteUrlLink("https://added.example.com"));
    expect(result.current.urlLinks.find((l) => l.url === "https://added.example.com")).toBeUndefined();
  });

  test("handleReorderItems: アイテムの順序を変更する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // cat-1 にアイテム追加してリオーダー
    act(() => result.current.handleDropFile("cat-1", "docs/new/file.md", "file.md"));
    act(() => result.current.handleReorderItems("cat-1", 0, 1));
    const cat1 = result.current.categories.find((c) => c.id === "cat-1");
    expect(cat1?.items[0].docKey).toBe("docs/new/file.md");
    expect(cat1?.items[1].docKey).toBe("docs/folder1/test.md");
  });

  test("handleDragStart / handleDragEnd: カテゴリのドラッグ並び替え", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleDragStart({ active: { id: "cat-1" } } as any));
    expect(result.current.activeCategory?.id).toBe("cat-1");

    act(() => result.current.handleDragEnd({
      active: { id: "cat-1" },
      over: { id: "cat-2" },
    } as any));

    expect(result.current.categories[0].id).toBe("cat-2");
    expect(result.current.categories[1].id).toBe("cat-1");
  });

  test("handleDragEnd: over が null の場合何もしない", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const catsBefore = [...result.current.categories];
    act(() => result.current.handleDragEnd({
      active: { id: "cat-1" },
      over: null,
    } as any));
    expect(result.current.categories.map((c) => c.id)).toEqual(catsBefore.map((c) => c.id));
  });

  test("handleEditOpen / handleEditSave: カテゴリ編集", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const cat = result.current.categories[0];
    act(() => result.current.handleEditOpen(cat));
    expect(result.current.editCategory?.id).toBe(cat.id);
    expect(result.current.editItems).toEqual(cat.items);

    // アイテム追加
    act(() => result.current.handleEditAddItem(mockFiles[1]));
    expect(result.current.editItems).toHaveLength(2);

    // 重複追加は無視
    act(() => result.current.handleEditAddItem(mockFiles[1]));
    expect(result.current.editItems).toHaveLength(2);

    // アイテム表示名変更
    act(() => result.current.handleEditItemDisplayName(mockFiles[1].key, "Edited Name"));
    expect(result.current.editItems.find((i) => i.docKey === mockFiles[1].key)?.displayName).toBe("Edited Name");

    // アイテム削除
    act(() => result.current.handleEditRemoveItem(mockFiles[1].key));
    expect(result.current.editItems).toHaveLength(1);

    // formRef を更新（実際のUIではTextFieldのonChangeで更新される）
    result.current.editFormRef.current.title = "Updated Title";
    result.current.editFormRef.current.description = "Updated Desc";

    // 保存
    act(() => result.current.handleEditSave());
    expect(result.current.editCategory).toBeNull();
    const updated = result.current.categories.find((c) => c.id === cat.id);
    expect(updated?.title).toBe("Updated Title");
    expect(updated?.description).toBe("Updated Desc");
  });

  test("handleEditSave: editCategory が null の場合何もしない", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleEditSave());
    // エラーなく完了することを確認
    expect(result.current.editCategory).toBeNull();
  });

  test("handleSave: レイアウトを保存する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSnackbar(null));

    // PUT にだけ応答を変える。GET は引き続き正常に返す。
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") {
        return Promise.resolve({ ok: true } as Response);
      }
      // 初期ロード用の fetch が再度呼ばれても正常に返す
      if (typeof url === "string" && url.includes("/api/docs")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: mockFiles }) } as Response);
      }
      if (typeof url === "string" && url.includes("/api/sites/layout")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: mockCategories, siteDescription: "Test site" }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    act(() => { result.current.handleSave(); });

    await waitFor(() => {
      expect(result.current.snackbar).toEqual({
        message: "sitesSaveSuccess",
        severity: "success",
      });
    });
  });

  test("handleSave: 保存失敗時にエラーを表示する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSnackbar(null));

    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") {
        return Promise.resolve({ ok: false, status: 500 } as Response);
      }
      if (typeof url === "string" && url.includes("/api/docs")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: mockFiles }) } as Response);
      }
      if (typeof url === "string" && url.includes("/api/sites/layout")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: mockCategories, siteDescription: "Test site" }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    act(() => { result.current.handleSave(); });

    await waitFor(() => {
      expect(result.current.snackbar).toEqual({
        message: "sitesSaveError",
        severity: "error",
      });
    });
  });

  test("handleDeleteFile: ファイルを削除する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDeleteTarget({ kind: "file", file: mockFiles[0] }));

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ files: [] }) });

    act(() => { result.current.handleDeleteFile(); });

    await waitFor(() => {
      expect(result.current.deleteTarget).toBeNull();
    });
    expect(result.current.snackbar?.severity).toBe("success");
  });

  test("handleDeleteFile: deleteTarget が null の場合何もしない", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.handleDeleteFile(); });
    // エラーなく完了
    expect(result.current.deleteTarget).toBeNull();
  });

  test("handleDeleteFile: フォルダ削除", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDeleteTarget({
      kind: "folder",
      folder: "folder1",
      files: mockFiles,
    }));

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ files: [] }) });

    act(() => { result.current.handleDeleteFile(); });

    await waitFor(() => {
      expect(result.current.deleteTarget).toBeNull();
    });
    expect(result.current.snackbar?.severity).toBe("success");
  });

  test("handleDeleteFile: 削除失敗時にエラーを表示する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDeleteTarget({ kind: "file", file: mockFiles[0] }));

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ files: mockFiles }) });

    act(() => { result.current.handleDeleteFile(); });

    await waitFor(() => {
      expect(result.current.snackbar?.severity).toBe("error");
    });
  });

  test("handleCancelOverwrite: uploadConfirm をクリアする", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleCancelOverwrite());
    expect(result.current.uploadConfirm).toBeNull();
  });

  test("setSiteDescription: サイト説明を更新する", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSiteDescription("New description"));
    expect(result.current.siteDescription).toBe("New description");
  });

  test("setSnackbar: スナックバーを設定・クリアする", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSnackbar({ message: "Test", severity: "success" }));
    expect(result.current.snackbar?.message).toBe("Test");

    act(() => result.current.setSnackbar(null));
    expect(result.current.snackbar).toBeNull();
  });
});
