/**
 * useSelectedBlock.ts — ブロック編集オーバーレイ共通の汎用フックのテスト。
 * 選択検出・矩形計測・属性更新・削除の契約を検証する。
 */
import { act, renderHook } from "@testing-library/react";

jest.mock("@anytime-markdown/markdown-react", () => ({
  useEditorState: ({ editor, selector }: any) =>
    editor ? selector({ editor }) : -1,
}));

import { useSelectedBlock } from "../hooks/useSelectedBlock";

function makeEditor(node: any, commandSink: any[]) {
  const chain = () => {
    const c: any = {
      focus: () => c,
      command: (fn: any) => {
        commandSink.push(fn);
        return c;
      },
      run: () => true,
    };
    return c;
  };
  return {
    isEditable: true,
    state: {
      selection: { node, from: 5 },
      doc: { nodeAt: (p: number) => (p === 5 ? node : null) },
    },
    view: {
      nodeDOM: () => {
        const el = document.createElement("div");
        el.getBoundingClientRect = () =>
          ({ top: 10, left: 20, width: 100, height: 50 }) as DOMRect;
        return el;
      },
    },
    chain,
  } as any;
}

const gifNode = { type: { name: "gifBlock" }, nodeSize: 1, attrs: { src: "x.gif" } };

describe("useSelectedBlock", () => {
  it("returns pos/node/rect for a selected block of the matching type", () => {
    const editor = makeEditor(gifNode, []);
    const { result } = renderHook(() => useSelectedBlock(editor, "gifBlock"));
    expect(result.current.pos).toBe(5);
    expect(result.current.node).toBe(gifNode);
    expect(result.current.rect?.top).toBe(10);
  });

  it("returns no selection when the selected node type does not match", () => {
    const para = { type: { name: "paragraph" }, nodeSize: 1, attrs: {} };
    const editor = makeEditor(para, []);
    const { result } = renderHook(() => useSelectedBlock(editor, "gifBlock"));
    expect(result.current.pos).toBe(-1);
    expect(result.current.node).toBeNull();
  });

  it("returns empty selection when editor is null", () => {
    const { result } = renderHook(() => useSelectedBlock(null, "gifBlock"));
    expect(result.current.pos).toBe(-1);
    expect(result.current.node).toBeNull();
    expect(result.current.rect).toBeNull();
  });

  it("updateAttrs sets each attribute on the selected node pos", () => {
    const sink: any[] = [];
    const editor = makeEditor(gifNode, sink);
    const { result } = renderHook(() => useSelectedBlock(editor, "gifBlock"));

    act(() => result.current.updateAttrs({ src: "y.gif", alt: "z" }));
    expect(sink.length).toBe(1);

    const tr = { setNodeAttribute: jest.fn() };
    sink[0]({ tr });
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, "src", "y.gif");
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, "alt", "z");
  });

  it("deleteBlock deletes the pos..pos+nodeSize range", () => {
    const sink: any[] = [];
    const editor = makeEditor(gifNode, sink);
    const { result } = renderHook(() => useSelectedBlock(editor, "gifBlock"));

    act(() => result.current.deleteBlock());
    const tr = { delete: jest.fn() };
    sink[sink.length - 1]({ tr, state: editor.state });
    expect(tr.delete).toHaveBeenCalledWith(5, 6);
  });
});
