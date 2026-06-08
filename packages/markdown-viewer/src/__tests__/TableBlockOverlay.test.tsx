/**
 * TableBlockOverlay.tsx — 選択駆動オーバーレイ（chrome 側）のロジックテスト。
 * 選択検出 → ツールバー描画 → 列追加 / 削除 / スプレッドシート編集の配線を検証する。
 * 重い spreadsheet-viewer / adapter / markdown-react / テーマフックはスタブ化する。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@anytime-markdown/markdown-react", () => ({
  useEditorState: ({ editor, selector }: any) =>
    editor ? selector({ editor }) : -1,
}));

jest.mock("@anytime-markdown/spreadsheet-viewer", () => ({
  SpreadsheetI18nProvider: ({ children }: any) => <div>{children}</div>,
  SpreadsheetGrid: () => <div data-testid="sheet-grid" />,
}));

jest.mock("../spreadsheet/TiptapSheetAdapter", () => ({
  createTiptapSheetAdapter: () => ({}),
}));

jest.mock("../utils/tableHelpers", () => ({
  moveTableRow: jest.fn(),
  moveTableColumn: jest.fn(),
}));

jest.mock("../i18n/context", () => ({ useMarkdownT: () => (k: string) => k }));
jest.mock("../contexts/ThemeModeContext", () => ({ useIsDark: () => false }));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ label, onEdit, onDelete, extra }: any) => (
    <div data-testid="toolbar">
      <span>{label}</span>
      <button onClick={onEdit}>edit</button>
      <button onClick={onDelete}>delete</button>
      {extra}
    </div>
  ),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ open, children }: any) =>
    open ? <div data-testid="edit-dialog">{children}</div> : null,
}));

jest.mock("../components/EditDialogHeader", () => ({ EditDialogHeader: () => null }));

import { TableBlockOverlay } from "../components/TableBlockOverlay";

function makeEditor(node: any, sink: any[]) {
  const chain = () => {
    const c: any = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "run") return () => true;
          return (...args: any[]) => {
            sink.push({ method: String(prop), args });
            return c;
          };
        },
      },
    );
    return c;
  };
  return {
    isEditable: true,
    extensionManager: { extensions: [{ name: "table", options: {} }] },
    state: {
      selection: { node, from: 5 },
      doc: { nodeAt: (p: number) => (p === 5 ? node : null) },
    },
    view: {
      nodeDOM: () => {
        const el = document.createElement("div");
        el.getBoundingClientRect = () =>
          ({ top: 10, left: 20, width: 200, height: 80 }) as DOMRect;
        return el;
      },
    },
    chain,
  } as any;
}

const tableNode = { type: { name: "table" }, nodeSize: 12, attrs: {} };

describe("TableBlockOverlay", () => {
  it("renders nothing harmful when editor is null", () => {
    render(<TableBlockOverlay editor={null} />);
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("renders the table toolbar for the selected table", () => {
    render(<TableBlockOverlay editor={makeEditor(tableNode, [])} />);
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(screen.getByLabelText("addColumn")).toBeTruthy();
  });

  it("does not render the toolbar when the selection is not a table", () => {
    const para = { type: { name: "paragraph" }, nodeSize: 1, attrs: {} };
    render(<TableBlockOverlay editor={makeEditor(para, [])} />);
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("adds a column via an editor command", () => {
    const sink: any[] = [];
    render(<TableBlockOverlay editor={makeEditor(tableNode, sink)} />);
    fireEvent.click(screen.getByLabelText("addColumn"));
    expect(sink.some((c) => c.method === "addColumnAfter")).toBe(true);
  });

  it("dispatches a delete command for the selected table", () => {
    const sink: any[] = [];
    render(<TableBlockOverlay editor={makeEditor(tableNode, sink)} />);
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(sink.some((c) => c.method === "command")).toBe(true);
  });

  it("opens the spreadsheet edit dialog on edit", () => {
    render(<TableBlockOverlay editor={makeEditor(tableNode, [])} />);
    fireEvent.click(screen.getByText("edit"));
    expect(screen.getByTestId("sheet-grid")).toBeTruthy();
  });
});
