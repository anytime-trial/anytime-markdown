/**
 * useFileSystem.ts - 追加カバレッジテスト (lines 11-14, 23, 36, 84-88)
 * hasWritePermissionDenied, localStorage error, nativeHandle restore, saveFile permission denied
 */
import { renderHook, act } from "@testing-library/react";
import { useFileSystem } from "../hooks/useFileSystem";

jest.mock("../constants/storageKeys", () => ({
  STORAGE_KEY_FILENAME: "test-filename",
}));

const mockLoadNativeHandle = jest.fn();
const mockSaveNativeHandle = jest.fn();
const mockClearNativeHandle = jest.fn();

jest.mock("../utils/fileHandleStore", () => ({
  loadNativeHandle: (...args: any[]) => mockLoadNativeHandle(...args),
  saveNativeHandle: (...args: any[]) => mockSaveNativeHandle(...args),
  clearNativeHandle: (...args: any[]) => mockClearNativeHandle(...args),
}));

describe("useFileSystem coverage2", () => {
  beforeEach(() => {
    localStorage.clear();
    mockLoadNativeHandle.mockResolvedValue(null);
    mockSaveNativeHandle.mockResolvedValue(undefined);
    mockClearNativeHandle.mockResolvedValue(undefined);
  });

  it("initializes with saved filename from localStorage", () => {
    localStorage.setItem("test-filename", "saved.md");
    const { result } = renderHook(() => useFileSystem(null));
    expect(result.current.fileName).toBe("saved.md");
  });

  it("initializes to null when no saved filename", () => {
    const { result } = renderHook(() => useFileSystem(null));
    expect(result.current.fileName).toBeNull();
  });

  it("saveFile falls back to saveAs when write permission denied (lines 84-88)", async () => {
    const mockNativeHandle = {
      name: "test.md",
      queryPermission: jest.fn().mockResolvedValue("prompt"),
      requestPermission: jest.fn().mockResolvedValue("denied"),
    };
    const newHandle = { name: "new.md" };
    const provider = {
      supportsDirectAccess: true,
      open: jest.fn(),
      save: jest.fn(),
      saveAs: jest.fn().mockResolvedValue(newHandle),
    };

    localStorage.setItem("test-filename", "test.md");
    mockLoadNativeHandle.mockResolvedValue(mockNativeHandle);

    const { result } = renderHook(() => useFileSystem(provider));

    // Wait for nativeHandle restoration
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Set the file handle with nativeHandle manually
    act(() => {
      result.current.setFileHandle({ name: "test.md", nativeHandle: mockNativeHandle });
    });

    // Save - permission should be denied, fallback to saveAs
    let saved = false;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(true);
    expect(provider.saveAs).toHaveBeenCalledWith("content");
  });

  it("saveFile returns false when saveAs returns null on permission denied", async () => {
    const mockNativeHandle = {
      name: "test.md",
      queryPermission: jest.fn().mockResolvedValue("prompt"),
      requestPermission: jest.fn().mockResolvedValue("denied"),
    };
    const provider = {
      supportsDirectAccess: true,
      open: jest.fn(),
      save: jest.fn(),
      saveAs: jest.fn().mockResolvedValue(null),
    };

    const { result } = renderHook(() => useFileSystem(provider));
    act(() => {
      result.current.setFileHandle({ name: "test.md", nativeHandle: mockNativeHandle });
    });

    let saved = false;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(false);
  });

  it("saveFile calls provider.save when permission granted (lines 11-14)", async () => {
    const mockNativeHandle = {
      name: "test.md",
      queryPermission: jest.fn().mockResolvedValue("granted"),
    };
    const provider = {
      supportsDirectAccess: true,
      open: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      saveAs: jest.fn(),
    };

    const { result } = renderHook(() => useFileSystem(provider));
    act(() => {
      result.current.setFileHandle({ name: "test.md", nativeHandle: mockNativeHandle });
    });

    let saved = false;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(true);
    expect(provider.save).toHaveBeenCalled();
  });

  it("saveFile without nativeHandle uses saveAs", async () => {
    const newHandle = { name: "new.md" };
    const provider = {
      supportsDirectAccess: false,
      open: jest.fn(),
      save: jest.fn(),
      saveAs: jest.fn().mockResolvedValue(newHandle),
    };

    const { result } = renderHook(() => useFileSystem(provider));

    let saved = false;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(true);
    expect(provider.saveAs).toHaveBeenCalledWith("content");
  });

  it("saveFile returns false when no provider", async () => {
    const { result } = renderHook(() => useFileSystem(null));

    let saved = false;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(false);
  });

  it("saveAsFile returns true on success", async () => {
    const newHandle = { name: "as.md" };
    const provider = {
      supportsDirectAccess: false,
      open: jest.fn(),
      save: jest.fn(),
      saveAs: jest.fn().mockResolvedValue(newHandle),
    };

    const { result } = renderHook(() => useFileSystem(provider));

    let saved = false;
    await act(async () => {
      saved = await result.current.saveAsFile("content");
    });

    expect(saved).toBe(true);
  });

  it("saveAsFile returns false when saveAs returns null", async () => {
    const provider = {
      supportsDirectAccess: false,
      open: jest.fn(),
      save: jest.fn(),
      saveAs: jest.fn().mockResolvedValue(null),
    };

    const { result } = renderHook(() => useFileSystem(provider));

    let saved = false;
    await act(async () => {
      saved = await result.current.saveAsFile("content");
    });

    expect(saved).toBe(false);
  });

  it("openFile opens and returns content", async () => {
    const provider = {
      supportsDirectAccess: false,
      open: jest.fn().mockResolvedValue({ handle: { name: "opened.md" }, content: "# Hello" }),
      save: jest.fn(),
      saveAs: jest.fn(),
    };

    const { result } = renderHook(() => useFileSystem(provider));

    let content: string | null = null;
    await act(async () => {
      content = await result.current.openFile();
    });

    expect(content).toBe("# Hello");
    expect(result.current.fileName).toBe("opened.md");
  });

  it("openFile returns null when provider.open returns null", async () => {
    const provider = {
      supportsDirectAccess: false,
      open: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      saveAs: jest.fn(),
    };

    const { result } = renderHook(() => useFileSystem(provider));

    let content: string | null = "not null";
    await act(async () => {
      content = await result.current.openFile();
    });

    expect(content).toBeNull();
  });

  it("markDirty sets isDirty to true", () => {
    const { result } = renderHook(() => useFileSystem(null));
    expect(result.current.isDirty).toBe(false);
    act(() => { result.current.markDirty(); });
    expect(result.current.isDirty).toBe(true);
  });

  it("resetFile clears fileHandle and isDirty", () => {
    const { result } = renderHook(() => useFileSystem(null));
    act(() => { result.current.markDirty(); });
    act(() => { result.current.resetFile(); });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.fileName).toBeNull();
  });

  it("clearNativeHandle called when fileHandle becomes null", async () => {
    const { result } = renderHook(() => useFileSystem(null));
    act(() => { result.current.setFileHandle({ name: "test.md" }); });
    act(() => { result.current.resetFile(); });
    // clearNativeHandle should be called
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(mockClearNativeHandle).toHaveBeenCalled();
  });

  it("hasWritePermissionDenied returns false when queryPermission not available", async () => {
    // Handle without queryPermission
    const mockNativeHandle = { name: "test.md" };
    const provider = {
      supportsDirectAccess: true,
      open: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      saveAs: jest.fn(),
    };

    const { result } = renderHook(() => useFileSystem(provider));
    act(() => {
      result.current.setFileHandle({ name: "test.md", nativeHandle: mockNativeHandle });
    });

    let saved = false;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(true);
    expect(provider.save).toHaveBeenCalled();
  });
});
