/**
 * useEditorSideEffects のユニットテスト
 *
 * ファイル変更検知、beforeunload警告、VS Codeコンテンツ更新を検証する。
 */

import { renderHook, act } from "@testing-library/react";

jest.mock("../types", () => ({
  extractHeadings: jest.fn().mockReturnValue([]),
  getMarkdownFromEditor: jest.fn().mockReturnValue("# Hello"),
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  parseFrontmatter: jest.fn().mockReturnValue({ frontmatter: null, body: "# New Content" }),
}));

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: (text: string) => text,
  preserveBlankLines: (text: string) => text,
}));

import { useEditorSideEffects } from "../hooks/useEditorSideEffects";
import { getMarkdownFromEditor } from "../types";

function createMockEditor() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    isDestroyed: false,
    on: jest.fn((event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    off: jest.fn((event: string, cb: () => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(l => l !== cb);
      }
    }),
    commands: { setContent: jest.fn() },
    _emit: (event: string) => { listeners[event]?.forEach(cb => cb()); },
  };
}

function createParams(overrides: Record<string, unknown> = {}) {
  return {
    editor: null,
    isDirty: false,
    markDirty: jest.fn(),
    setHeadingsRef: { current: jest.fn() },
    setEditorMarkdown: jest.fn(),
    frontmatterRef: { current: null as string | null },
    onFrontmatterChange: jest.fn(),
    ...overrides,
  } as Parameters<typeof useEditorSideEffects>[0];
}

describe("useEditorSideEffects", () => {
  describe("ファイル変更検知", () => {
    it("editor の update イベントで markDirty が呼ばれる", () => {
      const editor = createMockEditor();
      const markDirty = jest.fn();
      renderHook(() => useEditorSideEffects(createParams({ editor, markDirty })));

      act(() => { editor._emit("update"); });

      expect(markDirty).toHaveBeenCalled();
    });

    it("editor が null の場合はリスナー登録しない", () => {
      const markDirty = jest.fn();
      renderHook(() => useEditorSideEffects(createParams({ markDirty })));
      // エラーが出なければ OK
    });

    it("markDirty が undefined の場合はリスナー登録しない", () => {
      const editor = createMockEditor();
      renderHook(() => useEditorSideEffects(createParams({ editor, markDirty: undefined })));
      expect(editor.on).not.toHaveBeenCalledWith("update", expect.any(Function));
    });
  });

  describe("beforeunload 警告", () => {
    it("isDirty=true のとき beforeunload で preventDefault が呼ばれる", () => {
      renderHook(() => useEditorSideEffects(createParams({ isDirty: true })));

      const event = new Event("beforeunload", { cancelable: true });
      const spy = jest.spyOn(event, "preventDefault");
      globalThis.dispatchEvent(event);

      expect(spy).toHaveBeenCalled();
    });

    it("isDirty=false のとき beforeunload で preventDefault が呼ばれない", () => {
      renderHook(() => useEditorSideEffects(createParams({ isDirty: false })));

      const event = new Event("beforeunload", { cancelable: true });
      const spy = jest.spyOn(event, "preventDefault");
      globalThis.dispatchEvent(event);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("vscode-set-content イベント", () => {
    it("コンテンツが変更された場合にエディタを更新する", () => {
      const editor = createMockEditor();
      const setEditorMarkdown = jest.fn();
      const setHeadingsRef = { current: jest.fn() };
      const frontmatterRef = { current: null as string | null };

      // getMarkdownFromEditor が現在のコンテンツと異なる値を返すようにする
      (getMarkdownFromEditor as jest.Mock).mockReturnValue("# Old Content");

      renderHook(() => useEditorSideEffects(createParams({
        editor, setEditorMarkdown, setHeadingsRef, frontmatterRef,
      })));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: "# New Content" }));
      });

      expect(editor.commands.setContent).toHaveBeenCalled();
      expect(setHeadingsRef.current).toHaveBeenCalled();
      expect(setEditorMarkdown).toHaveBeenCalled();
    });

    it("コンテンツが同一の場合は更新しない", () => {
      const editor = createMockEditor();
      (getMarkdownFromEditor as jest.Mock).mockReturnValue("# New Content");

      renderHook(() => useEditorSideEffects(createParams({ editor })));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: "# New Content" }));
      });

      expect(editor.commands.setContent).not.toHaveBeenCalled();
    });

    it("editor が破棄済みの場合は何もしない", () => {
      const editor = createMockEditor();
      editor.isDestroyed = true;

      renderHook(() => useEditorSideEffects(createParams({ editor })));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: "# Test" }));
      });

      expect(editor.commands.setContent).not.toHaveBeenCalled();
    });
  });
});
