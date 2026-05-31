import { renderHook } from "@testing-library/react";
import { useCodeBlockAutoCollapse } from "../hooks/useCodeBlockAutoCollapse";
import type { Editor } from "@tiptap/react";

// --- Helpers ---
interface MockNode {
  type: { name: string };
  attrs: Record<string, unknown>;
}

function createMockEditor(nodes: MockNode[] = [], overrides?: Record<string, unknown>): Editor {
  const listeners = new Map<string, Set<() => void>>();

  return {
    isDestroyed: false,
    state: {
      doc: {
        descendants: jest.fn((cb: (node: MockNode, pos: number) => void) => {
          nodes.forEach((node, idx) => cb(node, idx));
        }),
      },
      tr: {
        setNodeMarkup: jest.fn(),
      },
    },
    view: {
      dispatch: jest.fn(),
    },
    on: jest.fn((event: string, handler: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    }),
    off: jest.fn((event: string, handler: () => void) => {
      listeners.get(event)?.delete(handler);
    }),
    ...overrides,
  } as unknown as Editor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFn = (obj: unknown, path: string): jest.Mock => {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) cur = (cur as Record<string, unknown>)[p];
  return cur as unknown as jest.Mock;
};

describe("useCodeBlockAutoCollapse", () => {
  beforeEach(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("sourceMode=true → 何もしない（dispatch 未呼び出し）", () => {
    const editor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "mermaid", collapsed: false } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(true, editor, null));
    expect(mockFn(editor, "view.dispatch")).not.toHaveBeenCalled();
    expect(mockFn(editor, "on")).not.toHaveBeenCalled();
  });

  test("mermaid codeBlock → collapsed=true に setNodeMarkup", () => {
    const editor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "mermaid", collapsed: false } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).toHaveBeenCalled();
    expect(mockFn(editor, "state.tr.setNodeMarkup")).toHaveBeenCalledWith(
      0,
      undefined,
      expect.objectContaining({ collapsed: true }),
    );
  });

  test("plantuml codeBlock → collapsed=true に setNodeMarkup", () => {
    const editor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "plantuml", collapsed: false } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).toHaveBeenCalled();
  });

  test("既に collapsed=true → dispatch 不要", () => {
    const editor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "mermaid", collapsed: true } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).not.toHaveBeenCalled();
  });

  test("通常 codeBlock (javascript 等) → 変更なし", () => {
    const editor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "javascript", collapsed: false } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).not.toHaveBeenCalled();
  });

  test("paragraph ノード → 無視", () => {
    const editor = createMockEditor([
      { type: { name: "paragraph" }, attrs: {} },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).not.toHaveBeenCalled();
  });

  test("editor=null → エラーなし", () => {
    expect(() => {
      renderHook(() => useCodeBlockAutoCollapse(false, null, null));
    }).not.toThrow();
  });

  test("両エディタを処理する", () => {
    const rightEditor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "mermaid", collapsed: false } },
    ]);
    const leftEditor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "plantuml", collapsed: false } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, rightEditor, leftEditor));
    expect(mockFn(rightEditor, "view.dispatch")).toHaveBeenCalled();
    expect(mockFn(leftEditor, "view.dispatch")).toHaveBeenCalled();
  });

  test("update イベントハンドラが登録される", () => {
    const editor = createMockEditor([]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "on")).toHaveBeenCalledWith("update", expect.any(Function));
  });

  test("cleanup → off() 呼び出し", () => {
    const editor = createMockEditor([]);
    const { unmount } = renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    unmount();
    expect(mockFn(editor, "off")).toHaveBeenCalledWith("update", expect.any(Function));
  });

  test("isDestroyed=true → dispatch しない", () => {
    const editor = createMockEditor(
      [{ type: { name: "codeBlock" }, attrs: { language: "mermaid", collapsed: false } }],
      { isDestroyed: true },
    );
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).not.toHaveBeenCalled();
  });

  test("language が大文字混在でも動作する (Mermaid)", () => {
    const editor = createMockEditor([
      { type: { name: "codeBlock" }, attrs: { language: "Mermaid", collapsed: false } },
    ]);
    renderHook(() => useCodeBlockAutoCollapse(false, editor, null));
    expect(mockFn(editor, "view.dispatch")).toHaveBeenCalled();
  });
});
