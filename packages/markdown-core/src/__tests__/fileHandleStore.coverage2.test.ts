/**
 * fileHandleStore.ts additional coverage tests
 * Targets error branches: openDB onerror, transaction onerror, objectStore creation
 */

describe("fileHandleStore error paths", () => {
  const origIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    Object.defineProperty(globalThis, "indexedDB", { value: origIndexedDB, writable: true });
    jest.resetModules();
  });

  it("openDB creates object store when not present", async () => {
    const mockCreateObjectStore = jest.fn();
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => false) },
      createObjectStore: mockCreateObjectStore,
      transaction: jest.fn(() => {
        const tx = { objectStore: jest.fn(() => ({ get: jest.fn((k: string) => { const r = { result: null, onsuccess: null as any, onerror: null as any }; setTimeout(() => r.onsuccess?.()); return r; }) })), oncomplete: null as any, onerror: null as any };
        setTimeout(() => tx.oncomplete?.());
        return tx;
      }),
      close: jest.fn(),
    };

    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open: jest.fn(() => {
          const req = { result: mockDb, onsuccess: null as any, onerror: null as any, onupgradeneeded: null as any };
          setTimeout(() => {
            req.onupgradeneeded?.();
            req.onsuccess?.();
          });
          return req;
        }),
      },
      writable: true,
    });

    const { loadNativeHandle } = await import("../utils/fileHandleStore");
    const result = await loadNativeHandle();
    expect(result).toBeNull();
    expect(mockCreateObjectStore).toHaveBeenCalledWith("file-handles");
  });

  it("openDB rejects on error", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open: jest.fn(() => {
          const req = { result: null, error: new Error("DB error"), onsuccess: null as any, onerror: null as any, onupgradeneeded: null as any };
          setTimeout(() => req.onerror?.());
          return req;
        }),
      },
      writable: true,
    });

    const { loadNativeHandle } = await import("../utils/fileHandleStore");
    await expect(loadNativeHandle()).rejects.toThrow("DB error");
  });

  it("openDB rejects with fallback error when req.error is null", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open: jest.fn(() => {
          const req = { result: null, error: null, onsuccess: null as any, onerror: null as any, onupgradeneeded: null as any };
          setTimeout(() => req.onerror?.());
          return req;
        }),
      },
      writable: true,
    });

    const { loadNativeHandle } = await import("../utils/fileHandleStore");
    await expect(loadNativeHandle()).rejects.toThrow("Failed to open IndexedDB");
  });

  it("saveNativeHandle rejects on transaction error", async () => {
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => true) },
      transaction: jest.fn(() => {
        const tx = { objectStore: jest.fn(() => ({ put: jest.fn() })), oncomplete: null as any, onerror: null as any, error: new Error("tx error") };
        setTimeout(() => tx.onerror?.());
        return tx;
      }),
      close: jest.fn(),
    };

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

    const { saveNativeHandle } = await import("../utils/fileHandleStore");
    await expect(saveNativeHandle({ name: "test" } as any)).rejects.toThrow("tx error");
  });

  it("saveNativeHandle rejects with fallback error when tx.error is null", async () => {
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => true) },
      transaction: jest.fn(() => {
        const tx = { objectStore: jest.fn(() => ({ put: jest.fn() })), oncomplete: null as any, onerror: null as any, error: null };
        setTimeout(() => tx.onerror?.());
        return tx;
      }),
      close: jest.fn(),
    };

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

    const { saveNativeHandle } = await import("../utils/fileHandleStore");
    await expect(saveNativeHandle({ name: "test" } as any)).rejects.toThrow("Failed to save file handle");
  });

  it("loadNativeHandle rejects on request error", async () => {
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => true) },
      transaction: jest.fn(() => {
        const tx = {
          objectStore: jest.fn(() => ({
            get: jest.fn(() => {
              const r = { result: null, error: new Error("req error"), onsuccess: null as any, onerror: null as any };
              setTimeout(() => r.onerror?.());
              return r;
            }),
          })),
          oncomplete: null as any,
          onerror: null as any,
        };
        return tx;
      }),
      close: jest.fn(),
    };

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

    const { loadNativeHandle } = await import("../utils/fileHandleStore");
    await expect(loadNativeHandle()).rejects.toThrow("req error");
  });

  it("clearNativeHandle rejects on transaction error", async () => {
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => true) },
      transaction: jest.fn(() => {
        const tx = { objectStore: jest.fn(() => ({ delete: jest.fn() })), oncomplete: null as any, onerror: null as any, error: new Error("clear error") };
        setTimeout(() => tx.onerror?.());
        return tx;
      }),
      close: jest.fn(),
    };

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

    const { clearNativeHandle } = await import("../utils/fileHandleStore");
    await expect(clearNativeHandle()).rejects.toThrow("clear error");
  });

  it("clearNativeHandle rejects with fallback error when tx.error is null", async () => {
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => true) },
      transaction: jest.fn(() => {
        const tx = { objectStore: jest.fn(() => ({ delete: jest.fn() })), oncomplete: null as any, onerror: null as any, error: null };
        setTimeout(() => tx.onerror?.());
        return tx;
      }),
      close: jest.fn(),
    };

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

    const { clearNativeHandle } = await import("../utils/fileHandleStore");
    await expect(clearNativeHandle()).rejects.toThrow("Failed to clear file handle");
  });

  it("loadNativeHandle rejects with fallback error when req.error is null", async () => {
    const mockDb = {
      objectStoreNames: { contains: jest.fn(() => true) },
      transaction: jest.fn(() => {
        const tx = {
          objectStore: jest.fn(() => ({
            get: jest.fn(() => {
              const r = { result: null, error: null, onsuccess: null as any, onerror: null as any };
              setTimeout(() => r.onerror?.());
              return r;
            }),
          })),
          oncomplete: null as any,
          onerror: null as any,
        };
        return tx;
      }),
      close: jest.fn(),
    };

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

    const { loadNativeHandle } = await import("../utils/fileHandleStore");
    await expect(loadNativeHandle()).rejects.toThrow("Failed to load file handle");
  });
});
