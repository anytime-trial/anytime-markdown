/**
 * graphStorage coverage test - comprehensive IndexedDB mock
 */

// Create a proper fake IndexedDB
const stores: Map<string, Map<string, any>> = new Map();

class FakeObjectStore {
  private storeName: string;
  constructor(storeName: string) {
    this.storeName = storeName;
    if (!stores.has(storeName)) stores.set(storeName, new Map());
  }
  put(item: any) {
    stores.get(this.storeName)!.set(item.id, item);
    return {};
  }
  get(key: string) {
    const req: any = { result: stores.get(this.storeName)?.get(key) ?? undefined };
    Promise.resolve().then(() => req.onsuccess?.());
    return req;
  }
  delete(key: string) {
    stores.get(this.storeName)!.delete(key);
    return {};
  }
  getAll() {
    const req: any = { result: [...(stores.get(this.storeName)?.values() ?? [])] };
    Promise.resolve().then(() => req.onsuccess?.());
    return req;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: Error | null = null;
  private storeName: string;
  constructor(storeName: string) {
    this.storeName = storeName;
    Promise.resolve().then(() => this.oncomplete?.());
  }
  objectStore(_name: string) {
    return new FakeObjectStore(this.storeName);
  }
}

class FakeDB {
  objectStoreNames = {
    contains: (name: string) => stores.has(name),
  };
  createObjectStore(name: string) {
    stores.set(name, new Map());
    return new FakeObjectStore(name);
  }
  transaction(storeName: string, _mode?: string) {
    return new FakeTransaction(storeName);
  }
  close() {}
}

Object.defineProperty(globalThis, "indexedDB", {
  value: {
    open: (_name: string, _version: number) => {
      const req: any = { result: new FakeDB() };
      Promise.resolve().then(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  },
  writable: true,
  configurable: true,
});

import {
  saveDocument,
  loadDocument,
  deleteDocument,
  listDocuments,
  getLastDocumentId,
  setLastDocumentId,
} from "@anytime-markdown/graph-viewer/src/store/graphStorage";

const makeDoc = (id: string, name = "Test") => ({
  id,
  name,
  nodes: [],
  edges: [],
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe("graphStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    stores.clear();
  });

  it("saves and loads a document", async () => {
    const doc = makeDoc("test-1", "My Graph");
    await saveDocument(doc as any);
    const loaded = await loadDocument("test-1");
    expect(loaded).toBeTruthy();
    expect(loaded!.name).toBe("My Graph");
  });

  it("returns null for non-existent document", async () => {
    const loaded = await loadDocument("nonexistent");
    expect(loaded).toBeNull();
  });

  it("deletes a document", async () => {
    const doc = makeDoc("test-del");
    await saveDocument(doc as any);
    await deleteDocument("test-del");
    const loaded = await loadDocument("test-del");
    expect(loaded).toBeNull();
  });

  it("lists documents", async () => {
    const doc1 = makeDoc("list-1", "First");
    const doc2 = makeDoc("list-2", "Second");
    await saveDocument(doc1 as any);
    await saveDocument(doc2 as any);
    const list = await listDocuments();
    expect(list.length).toBe(2);
    // Both docs present (order depends on Date.now() timing)
    const ids = list.map(d => d.id);
    expect(ids).toContain("list-1");
    expect(ids).toContain("list-2");
  });

  it("getLastDocumentId returns null by default", () => {
    expect(getLastDocumentId()).toBeNull();
  });

  it("setLastDocumentId and getLastDocumentId work together", () => {
    setLastDocumentId("my-doc");
    expect(getLastDocumentId()).toBe("my-doc");
  });
});
