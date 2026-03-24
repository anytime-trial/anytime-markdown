/**
 * fileHandleStore.ts のカバレッジテスト
 * IndexedDB のモックを使って FileSystemFileHandle の永続化をテスト
 */

// IndexedDB をモック
const mockStore: Record<string, unknown> = {};

const mockObjectStore = {
  put: jest.fn((value: unknown, key: string) => {
    mockStore[key] = value;
    return { onsuccess: null, onerror: null };
  }),
  get: jest.fn((key: string) => {
    const req = { result: mockStore[key] ?? undefined, onsuccess: null as any, onerror: null as any };
    setTimeout(() => req.onsuccess?.());
    return req;
  }),
  delete: jest.fn((key: string) => {
    delete mockStore[key];
    return { onsuccess: null, onerror: null };
  }),
};

const mockTransaction = {
  objectStore: jest.fn(() => mockObjectStore),
  oncomplete: null as any,
  onerror: null as any,
};

const mockDb = {
  transaction: jest.fn(() => {
    const tx = { ...mockTransaction, oncomplete: null as any, onerror: null as any };
    // Auto-complete transaction
    setTimeout(() => tx.oncomplete?.());
    return tx;
  }),
  close: jest.fn(),
  objectStoreNames: { contains: jest.fn(() => true) },
};

// Mock indexedDB.open
const origIndexedDB = globalThis.indexedDB;
Object.defineProperty(globalThis, "indexedDB", {
  value: {
    open: jest.fn(() => {
      const req = { result: mockDb, onsuccess: null as any, onerror: null as any, onupgradeneeded: null as any };
      setTimeout(() => req.onsuccess?.());
      return req;
    }),
  },
  writable: true,
});

import { saveNativeHandle, loadNativeHandle, clearNativeHandle } from "../utils/fileHandleStore";

afterAll(() => {
  Object.defineProperty(globalThis, "indexedDB", { value: origIndexedDB, writable: true });
});

describe("fileHandleStore", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStore)) delete mockStore[key];
    jest.clearAllMocks();
  });

  describe("saveNativeHandle", () => {
    it("saves a handle without error", async () => {
      const fakeHandle = { name: "test.md", kind: "file" } as unknown as FileSystemFileHandle;
      await expect(saveNativeHandle(fakeHandle)).resolves.toBeUndefined();
    });

    it("overwrites a previously saved handle", async () => {
      const handle1 = { name: "file1.md", kind: "file" } as unknown as FileSystemFileHandle;
      const handle2 = { name: "file2.md", kind: "file" } as unknown as FileSystemFileHandle;
      await saveNativeHandle(handle1);
      await saveNativeHandle(handle2);
      const loaded = await loadNativeHandle();
      expect((loaded as any)?.name).toBe("file2.md");
    });
  });

  describe("loadNativeHandle", () => {
    it("returns null when no handle is saved", async () => {
      const result = await loadNativeHandle();
      expect(result).toBeNull();
    });

    it("returns saved handle", async () => {
      const fakeHandle = { name: "test.md", kind: "file" } as unknown as FileSystemFileHandle;
      await saveNativeHandle(fakeHandle);
      const result = await loadNativeHandle();
      expect((result as any)?.name).toBe("test.md");
    });
  });

  describe("clearNativeHandle", () => {
    it("clears a saved handle", async () => {
      const fakeHandle = { name: "test.md", kind: "file" } as unknown as FileSystemFileHandle;
      await saveNativeHandle(fakeHandle);
      await clearNativeHandle();
      const result = await loadNativeHandle();
      expect(result).toBeNull();
    });

    it("does not error when clearing empty store", async () => {
      await expect(clearNativeHandle()).resolves.toBeUndefined();
    });
  });

  describe("round-trip", () => {
    it("save -> load -> clear -> load returns null", async () => {
      const fakeHandle = { name: "roundtrip.md", kind: "file" } as unknown as FileSystemFileHandle;
      await saveNativeHandle(fakeHandle);
      const loaded = await loadNativeHandle();
      expect((loaded as any)?.name).toBe("roundtrip.md");
      await clearNativeHandle();
      const afterClear = await loadNativeHandle();
      expect(afterClear).toBeNull();
    });
  });
});
