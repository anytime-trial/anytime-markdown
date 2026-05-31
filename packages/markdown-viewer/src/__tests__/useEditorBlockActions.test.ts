/**
 * useEditorBlockActions のユニットテスト
 *
 * ブロック折りたたみ/展開のトグル操作を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useEditorBlockActions } from "../hooks/useEditorBlockActions";

function createMockEditor(nodes: { type: string; attrs: Record<string, unknown>; pos?: number }[]) {
  const tr = {
    setNodeMarkup: jest.fn(),
  };

  const editor = {
    state: {
      doc: {
        descendants: (callback: (node: unknown, pos: number) => boolean | void) => {
          let pos = 0;
          for (const node of nodes) {
            const result = callback(
              { type: { name: node.type }, attrs: { ...node.attrs } },
              node.pos ?? pos,
            );
            if (result === false) return;
            pos += 10;
          }
        },
      },
      tr,
    },
    view: {
      dispatch: jest.fn(),
    },
  };

  return { editor, tr };
}

describe("useEditorBlockActions", () => {
  describe("handleToggleAllBlocks", () => {
    it("展開されたブロックがあれば全て折りたたむ", () => {
      const { editor, tr } = createMockEditor([
        { type: "codeBlock", attrs: { collapsed: false } },
        { type: "table", attrs: { collapsed: true } },
        { type: "image", attrs: { collapsed: false } },
      ]);

      const { result } = renderHook(() => useEditorBlockActions({ editor: editor as never }));

      act(() => {
        result.current.handleToggleAllBlocks();
      });

      expect(tr.setNodeMarkup).toHaveBeenCalledTimes(3);
      // 全て collapsed: true に
      for (const call of tr.setNodeMarkup.mock.calls) {
        expect(call[2].collapsed).toBe(true);
      }
      expect(editor.view.dispatch).toHaveBeenCalled();
    });

    it("全て折りたたまれていれば展開する", () => {
      const { editor, tr } = createMockEditor([
        { type: "codeBlock", attrs: { collapsed: true } },
        { type: "table", attrs: { collapsed: true } },
      ]);

      const { result } = renderHook(() => useEditorBlockActions({ editor: editor as never }));

      act(() => {
        result.current.handleToggleAllBlocks();
      });

      for (const call of tr.setNodeMarkup.mock.calls) {
        expect(call[2].collapsed).toBe(false);
      }
    });

    it("editor が null の場合は何もしない", () => {
      const { result } = renderHook(() => useEditorBlockActions({ editor: null }));

      act(() => {
        result.current.handleToggleAllBlocks();
      });
      // エラーが出なければ OK
    });
  });

  describe("handleToggleDiagramCode", () => {
    it("mermaid/plantuml のコード表示をトグルする", () => {
      const { editor, tr } = createMockEditor([
        { type: "codeBlock", attrs: { language: "mermaid", codeCollapsed: false } },
        { type: "codeBlock", attrs: { language: "plantuml", codeCollapsed: true } },
        { type: "codeBlock", attrs: { language: "javascript", codeCollapsed: false } }, // 対象外
      ]);

      const { result } = renderHook(() => useEditorBlockActions({ editor: editor as never }));

      act(() => {
        result.current.handleToggleDiagramCode();
      });

      // mermaid と plantuml のみ変更される（2回）
      expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);
      for (const call of tr.setNodeMarkup.mock.calls) {
        expect(call[2].codeCollapsed).toBe(true); // 展開されたものがあるので全て折りたたむ
      }
    });
  });

  describe("handleExpandAllBlocks", () => {
    it("折りたたまれたブロックを全て展開する", () => {
      const { editor, tr } = createMockEditor([
        { type: "codeBlock", attrs: { collapsed: true } },
        { type: "table", attrs: { collapsed: false } }, // 既に展開済み
        { type: "image", attrs: { collapsed: true } },
      ]);

      const { result } = renderHook(() => useEditorBlockActions({ editor: editor as never }));

      act(() => {
        result.current.handleExpandAllBlocks();
      });

      // collapsed: true のもののみ変更（2回）
      expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);
      for (const call of tr.setNodeMarkup.mock.calls) {
        expect(call[2].collapsed).toBe(false);
      }
    });

    it("全て展開済みなら dispatch しない", () => {
      const { editor } = createMockEditor([
        { type: "codeBlock", attrs: { collapsed: false } },
      ]);

      const { result } = renderHook(() => useEditorBlockActions({ editor: editor as never }));

      act(() => {
        result.current.handleExpandAllBlocks();
      });

      expect(editor.view.dispatch).not.toHaveBeenCalled();
    });
  });
});
