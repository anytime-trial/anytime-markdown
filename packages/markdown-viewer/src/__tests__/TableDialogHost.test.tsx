/**
 * TableDialogHost.tsx — table ダイアログ host（React）のテスト。
 * vanilla chrome の intent（edit / delete）でダイアログを開閉し、編集開始で
 * setEditing(true)、削除確認で deleteBlockAt を発火することを検証する。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

const setEditing = jest.fn();
jest.mock("../chrome/tableBlockChrome", () => ({
  createTableBlockChrome: jest.fn(() => ({ setEditing, destroy: jest.fn() })),
}));

jest.mock("../chrome/blockChrome", () => ({
  deleteBlockAt: jest.fn(),
}));

jest.mock("../i18n/context", () => ({ useMarkdownT: () => (k: string) => k }));
jest.mock("../contexts/ThemeModeContext", () => ({ useIsDark: () => false }));

jest.mock("@anytime-markdown/spreadsheet-viewer", () => ({
  SpreadsheetGrid: () => <div data-testid="sheet" />,
  SpreadsheetI18nProvider: ({ children }: any) => <>{children}</>,
}));
jest.mock("../spreadsheet/TiptapSheetAdapter", () => ({
  createTiptapSheetAdapter: () => ({}),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
}));
jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ open, children }: any) =>
    open ? <div data-testid="edit">{children}</div> : null,
}));
jest.mock("../components/EditDialogHeader", () => ({ EditDialogHeader: () => null }));

import { TableDialogHost } from "../components/TableDialogHost";
import { createTableBlockChrome } from "../chrome/tableBlockChrome";
import { deleteBlockAt } from "../chrome/blockChrome";

const mockEditor = {
  isEditable: true,
  extensionManager: { extensions: [] },
  state: { doc: { nodeAt: () => ({ type: { name: "table" } }) } },
} as any;

function cb() {
  const calls = (createTableBlockChrome as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as {
    onEdit: (pos: number) => void;
    onDelete: (pos: number) => void;
  };
}

describe("TableDialogHost", () => {
  beforeEach(() => {
    (createTableBlockChrome as jest.Mock).mockClear();
    (deleteBlockAt as jest.Mock).mockClear();
    setEditing.mockClear();
  });

  it("editor が null なら chrome を生成しない", () => {
    render(<TableDialogHost editor={null} />);
    expect(createTableBlockChrome).not.toHaveBeenCalled();
  });

  it("edit intent でスプレッドシート編集を開き setEditing(true) を呼ぶ", () => {
    render(<TableDialogHost editor={mockEditor} />);
    act(() => cb().onEdit(5));
    expect(screen.getByTestId("edit")).toBeTruthy();
    expect(screen.getByTestId("sheet")).toBeTruthy();
    expect(setEditing).toHaveBeenCalledWith(true);
  });

  it("delete intent → 確認で deleteBlockAt を対象 pos で発火する", () => {
    render(<TableDialogHost editor={mockEditor} />);
    act(() => cb().onDelete(7));
    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(deleteBlockAt).toHaveBeenCalledWith(mockEditor, 7);
  });
});
