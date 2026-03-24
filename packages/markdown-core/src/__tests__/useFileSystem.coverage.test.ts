/**
 * useFileSystem.ts のカバレッジテスト
 */
jest.mock("../utils/fileHandleStore", () => ({
  saveNativeHandle: jest.fn().mockResolvedValue(undefined),
  loadNativeHandle: jest.fn().mockResolvedValue(null),
  clearNativeHandle: jest.fn().mockResolvedValue(undefined),
}));

import { renderHook, act } from "@testing-library/react";
import { useFileSystem } from "../hooks/useFileSystem";
import { STORAGE_KEY_FILENAME } from "../constants/storageKeys";

function createProvider(overrides: Partial<Record<string, any>> = {}) {
  return {
    supportsDirectAccess: true,
    open: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    saveAs: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("useFileSystem coverage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with null when no saved filename", () => {
    const { result } = renderHook(() => useFileSystem(null));
    expect(result.current.fileName).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  it("initializes with saved filename from localStorage", () => {
    localStorage.setItem(STORAGE_KEY_FILENAME, "test.md");
    const { result } = renderHook(() => useFileSystem(null));
    expect(result.current.fileName).toBe("test.md");
  });

  it("supportsDirectAccess reflects provider capability", () => {
    const provider = createProvider({ supportsDirectAccess: true });
    const { result } = renderHook(() => useFileSystem(provider));
    expect(result.current.supportsDirectAccess).toBe(true);
  });

  it("supportsDirectAccess is false when no provider", () => {
    const { result } = renderHook(() => useFileSystem(null));
    expect(result.current.supportsDirectAccess).toBe(false);
  });

  it("openFile returns null when provider is null", async () => {
    const { result } = renderHook(() => useFileSystem(null));
    let content: string | null = null;
    await act(async () => {
      content = await result.current.openFile();
    });
    expect(content).toBeNull();
  });

  it("openFile returns content from provider", async () => {
    const provider = createProvider({
      open: jest.fn().mockResolvedValue({ handle: { name: "opened.md" }, content: "# Opened" }),
    });
    const { result } = renderHook(() => useFileSystem(provider));
    let content: string | null = null;
    await act(async () => {
      content = await result.current.openFile();
    });
    expect(content).toBe("# Opened");
    expect(result.current.fileName).toBe("opened.md");
    expect(result.current.isDirty).toBe(false);
  });

  it("openFile returns null when provider returns null", async () => {
    const provider = createProvider({ open: jest.fn().mockResolvedValue(null) });
    const { result } = renderHook(() => useFileSystem(provider));
    let content: string | null = null;
    await act(async () => {
      content = await result.current.openFile();
    });
    expect(content).toBeNull();
  });

  it("saveFile returns false when provider is null", async () => {
    const { result } = renderHook(() => useFileSystem(null));
    let ok = false;
    await act(async () => {
      ok = await result.current.saveFile("# Content");
    });
    expect(ok).toBe(false);
  });

  it("saveFile uses saveAs when no nativeHandle", async () => {
    const newHandle = { name: "saved.md" };
    const provider = createProvider({ saveAs: jest.fn().mockResolvedValue(newHandle) });
    const { result } = renderHook(() => useFileSystem(provider));
    let ok = false;
    await act(async () => {
      ok = await result.current.saveFile("# Content");
    });
    expect(ok).toBe(true);
    expect(result.current.fileName).toBe("saved.md");
  });

  it("saveAsFile returns false when provider is null", async () => {
    const { result } = renderHook(() => useFileSystem(null));
    let ok = false;
    await act(async () => {
      ok = await result.current.saveAsFile("# Content");
    });
    expect(ok).toBe(false);
  });

  it("saveAsFile returns true on success", async () => {
    const provider = createProvider({ saveAs: jest.fn().mockResolvedValue({ name: "new.md" }) });
    const { result } = renderHook(() => useFileSystem(provider));
    let ok = false;
    await act(async () => {
      ok = await result.current.saveAsFile("# Content");
    });
    expect(ok).toBe(true);
    expect(result.current.fileName).toBe("new.md");
  });

  it("saveAsFile returns false when saveAs returns null", async () => {
    const provider = createProvider({ saveAs: jest.fn().mockResolvedValue(null) });
    const { result } = renderHook(() => useFileSystem(provider));
    let ok = false;
    await act(async () => {
      ok = await result.current.saveAsFile("# Content");
    });
    expect(ok).toBe(false);
  });

  it("markDirty sets isDirty to true", () => {
    const { result } = renderHook(() => useFileSystem(null));
    act(() => { result.current.markDirty(); });
    expect(result.current.isDirty).toBe(true);
  });

  it("resetFile clears file handle and isDirty", () => {
    localStorage.setItem(STORAGE_KEY_FILENAME, "test.md");
    const { result } = renderHook(() => useFileSystem(null));
    act(() => { result.current.markDirty(); });
    act(() => { result.current.resetFile(); });
    expect(result.current.fileName).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  it("setFileHandle updates the handle", () => {
    const { result } = renderHook(() => useFileSystem(null));
    act(() => { result.current.setFileHandle({ name: "manual.md" }); });
    expect(result.current.fileName).toBe("manual.md");
  });
});
