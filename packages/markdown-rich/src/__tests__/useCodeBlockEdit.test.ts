/**
 * useCodeBlockEdit / applyCodeBlockText のテスト。
 * 反転オーバーレイが旧 CodeBlockNodeView から移設した全画面編集状態機械を検証する。
 */

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  useTextareaSearch: () => ({ reset: jest.fn() }),
}));

import { act, renderHook } from "@testing-library/react";

import { applyCodeBlockText, useCodeBlockEdit } from "../components/codeblock/useCodeBlockEdit";

function mockEditor() {
  const replaceWith = jest.fn();
  const del = jest.fn();
  const editor = {
    schema: { text: (s: string) => ({ text: s }) },
    chain: () => ({
      command: (fn: (ctx: { tr: { replaceWith: typeof replaceWith; delete: typeof del } }) => boolean) => {
        fn({ tr: { replaceWith, delete: del } });
        return { run: jest.fn() };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { editor, replaceWith, del };
}

describe("applyCodeBlockText", () => {
  it("非空は from..to を text へ replaceWith する", () => {
    const { editor, replaceWith } = mockEditor();
    applyCodeBlockText(editor, 5, 3, "xyz");
    // from = 6, to = 9
    expect(replaceWith).toHaveBeenCalledWith(6, 9, { text: "xyz" });
  });

  it("空文字は範囲削除する", () => {
    const { editor, del } = mockEditor();
    applyCodeBlockText(editor, 5, 3, "");
    expect(del).toHaveBeenCalledWith(6, 9);
  });
});

describe("useCodeBlockEdit", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = { textContent: "abc", content: { size: 3 } } as any;

  it("editOpen を開くと現在コードを fsCode へスナップショットする", () => {
    const { editor } = mockEditor();
    const setEditOpen = jest.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useCodeBlockEdit(editor, 5, node, open, setEditOpen),
      { initialProps: { open: false } },
    );
    expect(result.current.fsCode).toBe("");
    rerender({ open: true });
    expect(result.current.fsCode).toBe("abc");
    expect(result.current.fsDirty).toBe(false);
  });

  it("テキスト変更で dirty になる", () => {
    const { editor } = mockEditor();
    const { result, rerender } = renderHook(
      ({ open }) => useCodeBlockEdit(editor, 5, node, open, jest.fn()),
      { initialProps: { open: false } },
    );
    rerender({ open: true });
    act(() => result.current.onFsTextChange("xyz"));
    expect(result.current.fsCode).toBe("xyz");
    expect(result.current.fsDirty).toBe(true);
  });

  it("apply で editor へ反映し editOpen を閉じる", () => {
    const { editor, replaceWith } = mockEditor();
    const setEditOpen = jest.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useCodeBlockEdit(editor, 5, node, open, setEditOpen),
      { initialProps: { open: false } },
    );
    rerender({ open: true });
    act(() => result.current.onFsTextChange("xyz"));
    act(() => result.current.onApply());
    expect(replaceWith).toHaveBeenCalledWith(6, 9, { text: "xyz" });
    expect(setEditOpen).toHaveBeenCalledWith(false);
    expect(result.current.fsDirty).toBe(false);
  });

  it("dirty 時の tryCloseEdit は破棄確認を開く", () => {
    const { editor } = mockEditor();
    const setEditOpen = jest.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useCodeBlockEdit(editor, 5, node, open, setEditOpen),
      { initialProps: { open: false } },
    );
    rerender({ open: true });
    act(() => result.current.onFsTextChange("xyz"));
    act(() => result.current.tryCloseEdit());
    expect(result.current.discardOpen).toBe(true);
    expect(setEditOpen).not.toHaveBeenCalled();
  });

  it("非 dirty の tryCloseEdit は即閉じる", () => {
    const { editor } = mockEditor();
    const setEditOpen = jest.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useCodeBlockEdit(editor, 5, node, open, setEditOpen),
      { initialProps: { open: false } },
    );
    rerender({ open: true });
    act(() => result.current.tryCloseEdit());
    expect(setEditOpen).toHaveBeenCalledWith(false);
    expect(result.current.discardOpen).toBe(false);
  });
});
