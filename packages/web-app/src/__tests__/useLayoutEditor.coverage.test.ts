import { renderHook, act, waitFor } from "@testing-library/react";

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

import { useLayoutEditor } from "../app/docs/edit/useLayoutEditor";

const mockFiles = [
  { key: "docs/folder1/test.md", name: "test.md", lastModified: "2024-01-01", size: 100 },
];
const mockCategories = [
  { id: "cat-1", title: "Category 1", description: "Desc 1", items: [{ docKey: "docs/folder1/test.md", displayName: "Test" }], order: 0 },
];

function setupFetchMock() {
  global.fetch = jest.fn((url: string) => {
    if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: mockFiles }) } as Response);
    }
    if (typeof url === "string" && url.includes("/api/sites/layout")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: mockCategories }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch;
}

describe("useLayoutEditor coverage", () => {
  beforeEach(() => { setupFetchMock(); });
  afterEach(() => { jest.restoreAllMocks(); });

  test("handleUpload: does nothing when no files selected", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSnackbar(null));

    const event = { target: { files: null } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });

    expect(result.current.snackbar).toBeNull();
  });

  test("handleUpload: shows error when folder name is empty", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "" });

    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });

    await waitFor(() => {
      expect(result.current.snackbar?.severity).toBe("error");
    });
  });

  test("handleUpload: uploads files when no existing folder conflict", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "newFolder/test.md" });

    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") return Promise.resolve({ ok: true } as Response);
      if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });

    await waitFor(() => {
      expect(result.current.snackbar?.severity).toBe("success");
    });
  });

  test("handleUpload: shows overwrite confirm when folder already exists", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "folder1/test.md" });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            files: [{ key: "docs/folder1/old.md", name: "old.md", lastModified: "2024-01-01", size: 100 }],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });

    await waitFor(() => {
      expect(result.current.uploadConfirm).not.toBeNull();
    });
    expect(result.current.uploadConfirm?.folder).toBe("folder1");
  });

  test("handleUpload: handles upload error", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "newFolder/test.md" });

    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") return Promise.resolve({ ok: false, status: 500 } as Response);
      if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });

    await waitFor(() => {
      expect(result.current.snackbar?.severity).toBe("error");
    });
  });

  test("handleUpload: continues upload when folder check fails", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "newFolder/test.md" });

    let callCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") return Promise.resolve({ ok: true } as Response);
      if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("network error"));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });

    await waitFor(() => {
      expect(result.current.snackbar?.severity).toBe("success");
    });
  });

  test("handleConfirmOverwrite: deletes existing files then uploads", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "folder1/test.md" });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/docs") && !url.includes("upload") && !url.includes("delete") && !url.includes("content")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            files: [{ key: "docs/folder1/old.md", name: "old.md", lastModified: "2024-01-01", size: 100 }],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => { result.current.handleUpload(event); });
    await waitFor(() => { expect(result.current.uploadConfirm).not.toBeNull(); });

    (global.fetch as jest.Mock).mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true } as Response);
      if (opts?.method === "POST") return Promise.resolve({ ok: true } as Response);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) } as Response);
    });

    act(() => { result.current.handleConfirmOverwrite(); });

    await waitFor(() => {
      expect(result.current.uploadConfirm).toBeNull();
    });
    expect(result.current.snackbar?.severity).toBe("success");
  });

  test("handleConfirmOverwrite: does nothing when uploadConfirm is null", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.handleConfirmOverwrite(); });

    expect(result.current.uploadConfirm).toBeNull();
  });

  test("handleDeleteFile: shows error when all deletes in allSettled fail", async () => {
    setupFetchMock();
    const { result } = renderHook(() => useLayoutEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set delete target to a folder with multiple files
    act(() => result.current.setDeleteTarget({
      kind: "folder",
      folder: "folder1",
      files: [
        { key: "docs/folder1/test.md", name: "test.md", lastModified: "2024-01-01", size: 100 },
        { key: "docs/folder1/test2.md", name: "test2.md", lastModified: "2024-01-02", size: 200 },
      ],
    }));

    // DELETE returns ok: false to trigger "failed > 0" branch
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ files: mockFiles }) });

    act(() => { result.current.handleDeleteFile(); });

    await waitFor(() => {
      expect(result.current.snackbar?.severity).toBe("error");
    });
  });
});
