/**
 * useSectionNumbers のユニットテスト
 *
 * TipTap Editor のモックを使い、セクション番号の挿入・削除を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useSectionNumbers } from "../hooks/useSectionNumbers";

/** Editor モックを作成する */
function createMockEditor(headings: { level: number; text: string }[]) {
  let nodes = headings.map((h) => ({
    type: { name: "heading" },
    attrs: { level: h.level },
    textContent: h.text,
  }));

  const dispatched: unknown[] = [];

  const tr = {
    insertText: jest.fn(),
    replaceWith: jest.fn(),
    delete: jest.fn(),
  };

  const editor = {
    state: {
      doc: {
        descendants: (callback: (node: unknown, pos: number) => void) => {
          let pos = 0;
          for (const node of nodes) {
            callback(node, pos);
            pos += node.textContent.length + 2; // ノード開始+終了分
          }
        },
      },
      tr,
    },
    schema: {
      text: (content: string) => ({ type: "text", text: content }),
    },
    view: {
      dispatch: jest.fn((transaction: unknown) => dispatched.push(transaction)),
    },
  };

  return { editor, tr, dispatched, updateNodes: (newNodes: typeof nodes) => { nodes = newNodes; } };
}

describe("useSectionNumbers", () => {
  it("handleInsertSectionNumbers がセクション番号を挿入する", () => {
    const { editor } = createMockEditor([
      { level: 1, text: "Introduction" },
      { level: 2, text: "Background" },
      { level: 2, text: "Motivation" },
      { level: 1, text: "Methods" },
    ]);

    const { result } = renderHook(() => useSectionNumbers(editor as never));

    act(() => {
      result.current.handleInsertSectionNumbers();
    });

    expect(editor.view.dispatch).toHaveBeenCalled();
    // 逆順で挿入される（pos が変わらないように）
    const calls = editor.state.tr.insertText.mock.calls;
    expect(calls).toHaveLength(4);
    // 逆順なので最後の呼び出しが最初の見出し
    expect(calls[3][0]).toBe("1. ");      // h1: Introduction
    expect(calls[2][0]).toBe("1.1. ");    // h2: Background
    expect(calls[1][0]).toBe("1.2. ");    // h2: Motivation
    expect(calls[0][0]).toBe("2. ");      // h1: Methods
  });

  it("handleInsertSectionNumbers が既存セクション番号を置換する", () => {
    const { editor } = createMockEditor([
      { level: 1, text: "1. Introduction" },
      { level: 2, text: "1.1. Background" },
    ]);

    const { result } = renderHook(() => useSectionNumbers(editor as never));

    act(() => {
      result.current.handleInsertSectionNumbers();
    });

    const replaceCalls = editor.state.tr.replaceWith.mock.calls;
    expect(replaceCalls).toHaveLength(2);
  });

  it("handleRemoveSectionNumbers がセクション番号を削除する", () => {
    const { editor } = createMockEditor([
      { level: 1, text: "1. Introduction" },
      { level: 2, text: "1.1. Background" },
      { level: 3, text: "Details" }, // 番号なし
    ]);

    const { result } = renderHook(() => useSectionNumbers(editor as never));

    act(() => {
      result.current.handleRemoveSectionNumbers();
    });

    expect(editor.view.dispatch).toHaveBeenCalled();
    const deleteCalls = editor.state.tr.delete.mock.calls;
    expect(deleteCalls).toHaveLength(2); // 番号付きの2つだけ削除
  });

  it("editor が null の場合は何もしない", () => {
    const { result } = renderHook(() => useSectionNumbers(null));

    act(() => {
      result.current.handleInsertSectionNumbers();
      result.current.handleRemoveSectionNumbers();
    });
    // エラーが出なければ OK
  });

  it("見出しがない場合は何もしない", () => {
    const { editor } = createMockEditor([]);

    const { result } = renderHook(() => useSectionNumbers(editor as never));

    act(() => {
      result.current.handleInsertSectionNumbers();
    });

    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });

  it("level 6 以上の見出しは対象外", () => {
    const { editor } = createMockEditor([
      { level: 1, text: "Heading 1" },
      { level: 6, text: "Heading 6" },
    ]);

    const { result } = renderHook(() => useSectionNumbers(editor as never));

    act(() => {
      result.current.handleInsertSectionNumbers();
    });

    const calls = editor.state.tr.insertText.mock.calls;
    expect(calls).toHaveLength(1); // level 1 のみ
    expect(calls[0][0]).toBe("1. ");
  });

  it("vscode-toggle-section-numbers イベントに応答する", () => {
    const { editor } = createMockEditor([
      { level: 1, text: "Title" },
    ]);

    renderHook(() => useSectionNumbers(editor as never));

    // show=true でセクション番号挿入
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-toggle-section-numbers", { detail: true }));
    });
    expect(editor.view.dispatch).toHaveBeenCalled();

    editor.view.dispatch.mockClear();

    // show=false でセクション番号削除
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-toggle-section-numbers", { detail: false }));
    });
    expect(editor.view.dispatch).toHaveBeenCalled();
  });
});
