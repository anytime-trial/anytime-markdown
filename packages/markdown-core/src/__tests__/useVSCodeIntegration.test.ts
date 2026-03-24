/**
 * useVSCodeIntegration のユニットテスト
 *
 * VS Code TreeView からのカスタムイベントハンドリングを検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useVSCodeIntegration } from "../hooks/useVSCodeIntegration";

function createMockEditor() {
  const mockNode = document.createElement("div");
  mockNode.scrollIntoView = jest.fn();
  return {
    isDestroyed: false,
    isEditable: true,
    chain: jest.fn().mockReturnValue({
      focus: jest.fn().mockReturnValue({
        setTextSelection: jest.fn().mockReturnValue({
          run: jest.fn(),
        }),
      }),
    }),
    view: {
      domAtPos: jest.fn().mockReturnValue({
        node: mockNode,
      }),
    },
    commands: {
      resolveComment: jest.fn(),
      unresolveComment: jest.fn(),
      removeComment: jest.fn(),
    },
  };
}

describe("useVSCodeIntegration", () => {
  describe("vscode-scroll-to-heading", () => {
    it("見出し位置へスクロールしフォーカスする", () => {
      const editor = createMockEditor();
      renderHook(() => useVSCodeIntegration(editor as never));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-scroll-to-heading", { detail: 42 }));
      });

      expect(editor.chain).toHaveBeenCalled();
      expect(editor.view.domAtPos).toHaveBeenCalledWith(42);
    });

    it("editor が null の場合は何もしない", () => {
      renderHook(() => useVSCodeIntegration(null));

      // エラーが出なければ OK
      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-scroll-to-heading", { detail: 0 }));
      });
    });

    it("editor が破棄済みの場合は何もしない", () => {
      const editor = createMockEditor();
      editor.isDestroyed = true;
      renderHook(() => useVSCodeIntegration(editor as never));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-scroll-to-heading", { detail: 10 }));
      });

      expect(editor.chain).not.toHaveBeenCalled();
    });
  });

  describe("vscode-scroll-to-comment", () => {
    it("コメント位置へスクロールする", () => {
      const editor = createMockEditor();
      renderHook(() => useVSCodeIntegration(editor as never));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-scroll-to-comment", { detail: 100 }));
      });

      expect(editor.view.domAtPos).toHaveBeenCalledWith(101); // pos + 1
    });
  });

  describe("コメント操作", () => {
    it("vscode-resolve-comment でコメントを解決する", () => {
      const editor = createMockEditor();
      renderHook(() => useVSCodeIntegration(editor as never));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-resolve-comment", { detail: "comment-1" }));
      });

      expect(editor.commands.resolveComment).toHaveBeenCalledWith("comment-1");
    });

    it("vscode-unresolve-comment でコメントを再開する", () => {
      const editor = createMockEditor();
      renderHook(() => useVSCodeIntegration(editor as never));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-unresolve-comment", { detail: "comment-2" }));
      });

      expect(editor.commands.unresolveComment).toHaveBeenCalledWith("comment-2");
    });

    it("vscode-delete-comment でコメントを削除する", () => {
      const editor = createMockEditor();
      renderHook(() => useVSCodeIntegration(editor as never));

      act(() => {
        globalThis.dispatchEvent(new CustomEvent("vscode-delete-comment", { detail: "comment-3" }));
      });

      expect(editor.commands.removeComment).toHaveBeenCalledWith("comment-3");
    });
  });

  it("アンマウント時にイベントリスナーが解除される", () => {
    const editor = createMockEditor();
    const spy = jest.spyOn(globalThis, "removeEventListener");

    const { unmount } = renderHook(() => useVSCodeIntegration(editor as never));
    unmount();

    const removedEvents = spy.mock.calls.map(c => c[0]);
    expect(removedEvents).toContain("vscode-scroll-to-heading");
    expect(removedEvents).toContain("vscode-scroll-to-comment");
    expect(removedEvents).toContain("vscode-resolve-comment");
    expect(removedEvents).toContain("vscode-unresolve-comment");
    expect(removedEvents).toContain("vscode-delete-comment");

    spy.mockRestore();
  });
});
