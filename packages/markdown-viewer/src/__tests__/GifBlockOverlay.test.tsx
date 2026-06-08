/**
 * GifBlockOverlay.tsx — 選択駆動オーバーレイ（chrome 側）のロジックテスト。
 * 選択検出 → ツールバー描画 → 削除コマンド発火を検証する。
 * 重い chrome（BlockInlineToolbar / ダイアログ）と markdown-react はスタブ化する。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

// markdown-react の useEditorState は selector を即時評価するスタブにする。
jest.mock("@anytime-markdown/markdown-react", () => ({
  useEditorState: ({ editor, selector }: any) =>
    editor ? selector({ editor }) : -1,
}));

jest.mock("../i18n/context", () => ({
  useMarkdownT: () => (key: string) => key,
}));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ label, onEdit, onDelete }: any) => (
    <div data-testid="toolbar">
      <span>{label}</span>
      <button onClick={onEdit}>edit</button>
      <button onClick={onDelete}>delete</button>
    </div>
  ),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
}));

jest.mock("../components/GifRecorderDialog", () => ({
  GifRecorderDialog: ({ open }: any) =>
    open ? <div data-testid="recorder" /> : null,
}));

jest.mock("../components/GifPlayerDialog", () => ({
  GifPlayerDialog: ({ open }: any) => (open ? <div data-testid="player" /> : null),
}));

import { GifBlockOverlay } from "../components/GifBlockOverlay";

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
      dom: document.createElement("div"),
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

const gifNode = {
  type: { name: "gifBlock" },
  nodeSize: 1,
  attrs: { src: "x.gif", gifSettings: null, autoEditOpen: false },
};

describe("GifBlockOverlay", () => {
  it("renders nothing harmful when editor is null", () => {
    const { container } = render(<GifBlockOverlay editor={null} />);
    expect(container).toBeTruthy();
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("renders the toolbar for the selected gifBlock", () => {
    const editor = makeEditor(gifNode, []);
    render(<GifBlockOverlay editor={editor} />);
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(screen.getByText("GIF")).toBeTruthy();
  });

  it("does not render the toolbar when the selection is not a gifBlock", () => {
    const paragraph = { type: { name: "paragraph" }, nodeSize: 1, attrs: {} };
    const editor = makeEditor(paragraph, []);
    render(<GifBlockOverlay editor={editor} />);
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("dispatches a delete command for the selected node", () => {
    const sink: any[] = [];
    const editor = makeEditor(gifNode, sink);
    render(<GifBlockOverlay editor={editor} />);

    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByTestId("confirm-delete"));

    expect(sink.length).toBeGreaterThan(0);
    // 削除コマンドが pos 範囲を tr.delete すること
    const tr = { delete: jest.fn() };
    sink[sink.length - 1]({ tr, state: editor.state });
    expect(tr.delete).toHaveBeenCalledWith(5, 6);
  });

  it("opens the player dialog on edit when a src exists", () => {
    const editor = makeEditor(gifNode, []);
    render(<GifBlockOverlay editor={editor} />);
    fireEvent.click(screen.getByText("edit"));
    expect(screen.getByTestId("player")).toBeTruthy();
  });
});
