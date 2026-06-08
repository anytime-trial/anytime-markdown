/**
 * ImageBlockOverlay.tsx — 選択駆動オーバーレイ（chrome 側）のロジックテスト。
 * 選択検出 → ツールバー描画 → 削除 / URL 編集 / 注釈ダイアログの配線を検証する。
 * 重いダイアログと markdown-react / テーマフックはスタブ化する。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@anytime-markdown/markdown-react", () => ({
  useEditorState: ({ editor, selector }: any) =>
    editor ? selector({ editor }) : -1,
}));

jest.mock("../i18n/context", () => ({
  useMarkdownT: () => (key: string) => key,
}));

jest.mock("../contexts/ThemeModeContext", () => ({
  useIsDark: () => false,
}));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ label, onDelete, extra }: any) => (
    <div data-testid="toolbar">
      <span>{label}</span>
      <button onClick={onDelete}>delete</button>
      {extra}
    </div>
  ),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
}));

jest.mock("../components/ImageAnnotationDialog", () => ({
  ImageAnnotationDialog: ({ open }: any) =>
    open ? <div data-testid="annotation" /> : null,
}));

jest.mock("../components/ScreenCaptureDialog", () => ({
  ScreenCaptureDialog: ({ open }: any) =>
    open ? <div data-testid="screencapture" /> : null,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ open, children }: any) =>
    open ? <div data-testid="edit-dialog">{children}</div> : null,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: () => null,
}));

jest.mock("../components/ImageCropTool", () => ({
  ImageCropTool: () => <div data-testid="crop" />,
}));

import { ImageBlockOverlay } from "../components/ImageBlockOverlay";

function makeEditor(node: any, sink: any[], onEditImage?: any) {
  const chain = () => {
    const c: any = {
      focus: () => c,
      command: (fn: any) => {
        sink.push(fn);
        return c;
      },
      run: () => true,
    };
    return c;
  };
  return {
    isEditable: true,
    storage: { image: { onEditImage } },
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

const imageNode = {
  type: { name: "image" },
  nodeSize: 1,
  attrs: { src: "p.png", alt: "pic", annotations: null },
};

describe("ImageBlockOverlay", () => {
  it("renders nothing harmful when editor is null", () => {
    render(<ImageBlockOverlay editor={null} />);
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("renders the toolbar for the selected image", () => {
    render(<ImageBlockOverlay editor={makeEditor(imageNode, [])} />);
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(screen.getByText("image")).toBeTruthy();
  });

  it("does not render the toolbar when the selection is not an image", () => {
    const para = { type: { name: "paragraph" }, nodeSize: 1, attrs: {} };
    render(<ImageBlockOverlay editor={makeEditor(para, [])} />);
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("dispatches a delete command for the selected image", () => {
    const sink: any[] = [];
    render(<ImageBlockOverlay editor={makeEditor(imageNode, sink)} />);
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByTestId("confirm-delete"));
    const tr = { delete: jest.fn() };
    sink[sink.length - 1]({ tr, state: { doc: { nodeAt: () => imageNode } } });
    expect(tr.delete).toHaveBeenCalledWith(5, 6);
  });

  it("delegates URL editing to the centralized onEditImage callback", () => {
    const onEditImage = jest.fn();
    render(<ImageBlockOverlay editor={makeEditor(imageNode, [], onEditImage)} />);
    fireEvent.click(screen.getByLabelText("imageUrl"));
    expect(onEditImage).toHaveBeenCalledWith({ pos: 5, src: "p.png", alt: "pic" });
  });

  it("opens the annotation dialog from the toolbar", () => {
    render(<ImageBlockOverlay editor={makeEditor(imageNode, [])} />);
    fireEvent.click(screen.getByLabelText("annotate"));
    expect(screen.getByTestId("annotation")).toBeTruthy();
  });
});
