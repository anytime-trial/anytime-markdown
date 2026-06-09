/**
 * GifDialogHost.tsx — gif ダイアログ host（React）のテスト。
 * vanilla chrome からの intent（edit / delete / record）でダイアログを開閉し、
 * 削除確認で deleteBlockAt を発火することを検証する。chrome と重いダイアログは mock。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("../chrome/gifBlockChrome", () => ({
  createGifBlockChrome: jest.fn(() => jest.fn()),
  deleteBlockAt: jest.fn(),
  setBlockAttrs: jest.fn(),
}));

jest.mock("../i18n/context", () => ({
  useMarkdownT: () => (key: string) => key,
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
}));

jest.mock("../components/GifRecorderDialog", () => ({
  GifRecorderDialog: ({ open }: any) => (open ? <div data-testid="recorder" /> : null),
}));

jest.mock("../components/GifPlayerDialog", () => ({
  GifPlayerDialog: ({ open }: any) => (open ? <div data-testid="player" /> : null),
}));

import { GifDialogHost } from "../components/GifDialogHost";
import { createGifBlockChrome, deleteBlockAt } from "../chrome/gifBlockChrome";

const mockEditor = { isEditable: true } as any;

function capturedCallbacks() {
  const calls = (createGifBlockChrome as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as {
    onEdit: (pos: number, ctx: { src: string; settings: string | null }) => void;
    onDelete: (pos: number) => void;
    onRecord: (pos: number) => void;
  };
}

describe("GifDialogHost", () => {
  beforeEach(() => {
    (createGifBlockChrome as jest.Mock).mockClear();
    (deleteBlockAt as jest.Mock).mockClear();
  });

  it("editor が null なら chrome を生成せず何も描画しない", () => {
    render(<GifDialogHost editor={null} />);
    expect(createGifBlockChrome).not.toHaveBeenCalled();
    expect(screen.queryByTestId("recorder")).toBeNull();
  });

  it("edit intent: src ありで player、src なしで recorder を開く", () => {
    render(<GifDialogHost editor={mockEditor} />);
    const cb = capturedCallbacks();

    act(() => cb.onEdit(5, { src: "x.gif", settings: null }));
    expect(screen.getByTestId("player")).toBeTruthy();

    act(() => cb.onEdit(2, { src: "", settings: null }));
    expect(screen.getByTestId("recorder")).toBeTruthy();
  });

  it("record intent で recorder を開く", () => {
    render(<GifDialogHost editor={mockEditor} />);
    const cb = capturedCallbacks();
    act(() => cb.onRecord(9));
    expect(screen.getByTestId("recorder")).toBeTruthy();
  });

  it("delete intent → 確認で deleteBlockAt を対象 pos で発火する", () => {
    render(<GifDialogHost editor={mockEditor} />);
    const cb = capturedCallbacks();

    act(() => cb.onDelete(5));
    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(deleteBlockAt).toHaveBeenCalledWith(mockEditor, 5);
  });
});
