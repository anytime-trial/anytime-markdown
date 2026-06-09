/**
 * ImageDialogHost.tsx — image ダイアログ host（React）のテスト。
 * vanilla chrome の intent（editCrop / annotate / delete）でダイアログを開閉し、
 * 削除確認で deleteBlockAt を対象 pos で発火することを検証する。chrome / 重いダイアログは mock。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("../chrome/imageBlockChrome", () => ({
  createImageBlockChrome: jest.fn(() => jest.fn()),
}));

jest.mock("../chrome/blockChrome", () => ({
  deleteBlockAt: jest.fn(),
  setBlockAttrs: jest.fn(),
}));

jest.mock("../i18n/context", () => ({
  useMarkdownT: () => (key: string) => key,
}));

jest.mock("../contexts/ThemeModeContext", () => ({
  useIsDark: () => false,
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ open, children }: any) =>
    open ? <div data-testid="crop">{children}</div> : null,
}));
jest.mock("../components/EditDialogHeader", () => ({ EditDialogHeader: () => null }));
jest.mock("../components/ImageCropTool", () => ({ ImageCropTool: () => <div data-testid="crop-tool" /> }));
jest.mock("../components/ImageAnnotationDialog", () => ({
  ImageAnnotationDialog: ({ open }: any) => (open ? <div data-testid="annotation" /> : null),
}));
jest.mock("../components/ScreenCaptureDialog", () => ({
  ScreenCaptureDialog: ({ open }: any) => (open ? <div data-testid="capture" /> : null),
}));

import { ImageDialogHost } from "../components/ImageDialogHost";
import { createImageBlockChrome } from "../chrome/imageBlockChrome";
import { deleteBlockAt } from "../chrome/blockChrome";

const mockEditor = { isEditable: true } as any;

function cb() {
  const calls = (createImageBlockChrome as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as {
    onEditCrop: (pos: number, ctx: { src: string }) => void;
    onAnnotate: (pos: number, ctx: { src: string; annotations: string | null }) => void;
    onDelete: (pos: number) => void;
  };
}

describe("ImageDialogHost", () => {
  beforeEach(() => {
    (createImageBlockChrome as jest.Mock).mockClear();
    (deleteBlockAt as jest.Mock).mockClear();
  });

  it("editor が null なら chrome を生成しない", () => {
    render(<ImageDialogHost editor={null} />);
    expect(createImageBlockChrome).not.toHaveBeenCalled();
  });

  it("editCrop intent で crop ダイアログ、annotate intent で注釈ダイアログを開く", () => {
    render(<ImageDialogHost editor={mockEditor} />);
    const c = cb();
    act(() => c.onEditCrop(5, { src: "a.png" }));
    expect(screen.getByTestId("crop")).toBeTruthy();

    act(() => c.onAnnotate(2, { src: "b.png", annotations: null }));
    expect(screen.getByTestId("annotation")).toBeTruthy();
  });

  it("delete intent → 確認で deleteBlockAt を対象 pos で発火する", () => {
    render(<ImageDialogHost editor={mockEditor} />);
    const c = cb();
    act(() => c.onDelete(7));
    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(deleteBlockAt).toHaveBeenCalledWith(mockEditor, 7);
  });
});
