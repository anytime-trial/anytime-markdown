/**
 * EditorContextMenu.tsx の追加カバレッジテスト
 * 対象: insertMarkdownText, contextmenu handler, vscode-paste-markdown,
 *        vscode-paste-codeblock, handleCut, handleCopy, handlePaste,
 *        handlePasteAsCodeBlock, handlePasteAsMarkdown, handleClose
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { EditorContextMenu } from "../components/EditorContextMenu";

// --- mocks ---
const mockPerformBlockCopy = jest.fn();
const mockCopyTextToClipboard = jest.fn();
const mockReadTextFromClipboard = jest.fn().mockResolvedValue(null);
const mockGetCopiedBlockNode = jest.fn().mockReturnValue(null);
const mockContainsBoxTable = jest.fn().mockReturnValue(false);
const mockBoxTableToMarkdown = jest.fn((s: string) => s);

jest.mock("../constants/colors", () => ({
  getBgPaper: () => "#fff",
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  CONTEXT_MENU_FONT_SIZE: 13,
  SHORTCUT_HINT_FONT_SIZE: 11,
}));

jest.mock("../utils/blockClipboard", () => ({
  findBlockNode: () => null,
  getCopiedBlockNode: () => mockGetCopiedBlockNode(),
  performBlockCopy: (...args: unknown[]) => mockPerformBlockCopy(...args),
}));

jest.mock("../utils/boxTableToMarkdown", () => ({
  boxTableToMarkdown: (s: string) => mockBoxTableToMarkdown(s),
  containsBoxTable: (s: string) => mockContainsBoxTable(s),
}));

jest.mock("../utils/clipboardHelpers", () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyTextToClipboard(...args),
  readTextFromClipboard: () => mockReadTextFromClipboard(),
}));

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

// Minimal mock editor
function createMockEditor(overrides: Record<string, unknown> = {}) {
  const dom = document.createElement("div");
  const chain = jest.fn().mockReturnValue({
    focus: jest.fn().mockReturnValue({
      insertContent: jest.fn().mockReturnValue({ run: jest.fn() }),
    }),
  });
  return {
    view: {
      dom,
      dispatch: jest.fn(),
    },
    state: {
      selection: { from: 0, to: 0, $from: { after: () => 10 } },
      tr: { insert: jest.fn().mockReturnThis(), scrollIntoView: jest.fn().mockReturnThis(), doc: { content: { size: 100 } } },
    },
    chain,
    isEditable: true,
    ...overrides,
  } as any;
}

const t = (key: string) => key;

beforeEach(() => {
  jest.clearAllMocks();
  mockReadTextFromClipboard.mockResolvedValue(null);
  mockGetCopiedBlockNode.mockReturnValue(null);
  mockContainsBoxTable.mockReturnValue(false);
});

describe("EditorContextMenu - extra coverage", () => {
  it("opens context menu on right-click and shows menu items", () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    // Simulate right-click on the editor dom
    act(() => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      });
      event.preventDefault = jest.fn();
      editor.view.dom.dispatchEvent(event);
    });

    // Menu should now be open
    expect(screen.getByText("cut")).toBeTruthy();
    expect(screen.getByText("copy")).toBeTruthy();
    expect(screen.getByText("paste")).toBeTruthy();
    expect(screen.getByText("pasteAsMarkdown")).toBeTruthy();
    expect(screen.getByText("pasteAsCodeBlock")).toBeTruthy();
    expect(screen.getByText("clearScreen")).toBeTruthy();
  });

  it("closes menu when a menu item is clicked", async () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 50 }),
      );
    });
    expect(screen.getByText("cut")).toBeTruthy();

    // Click copy to close the menu
    act(() => {
      fireEvent.click(screen.getByText("copy"));
    });
    await waitFor(() => {
      expect(screen.queryByText("cut")).toBeNull();
    });
  });

  it("handleCut calls performBlockCopy with cut=true and closes menu", async () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    act(() => {
      fireEvent.click(screen.getByText("cut"));
    });

    expect(mockPerformBlockCopy).toHaveBeenCalledWith(editor.view, true, expect.any(Function));
    await waitFor(() => {
      expect(screen.queryByText("cut")).toBeNull();
    });
  });

  it("handleCopy calls performBlockCopy with cut=false", () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    act(() => {
      fireEvent.click(screen.getByText("copy"));
    });

    expect(mockPerformBlockCopy).toHaveBeenCalledWith(editor.view, false, expect.any(Function));
  });

  it("handlePaste inserts clipboard text when available", async () => {
    mockReadTextFromClipboard.mockResolvedValue("pasted text");
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("paste"));
    });

    expect(editor.chain).toHaveBeenCalled();
  });

  it("handlePaste with copied block node inserts it via tr.insert", async () => {
    const mockNode = { copy: jest.fn().mockReturnValue("copied-content"), content: "inner" };
    mockGetCopiedBlockNode.mockReturnValue(mockNode);
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("paste"));
    });

    expect(mockNode.copy).toHaveBeenCalledWith("inner");
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("handlePaste early-returns when readOnly", async () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} readOnly t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("paste"));
    });

    expect(mockReadTextFromClipboard).not.toHaveBeenCalled();
  });

  it("handlePasteAsCodeBlock reads clipboard and inserts code block", async () => {
    mockReadTextFromClipboard.mockResolvedValue("const x = 1;");
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsCodeBlock"));
    });

    expect(editor.chain).toHaveBeenCalled();
  });

  it("handlePasteAsCodeBlock posts message to __vscode when clipboard is empty", async () => {
    mockReadTextFromClipboard.mockResolvedValue(null);
    const postMessage = jest.fn();
    (window as any).__vscode = { postMessage };
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsCodeBlock"));
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "readClipboardForCodeBlock" });
    delete (window as any).__vscode;
  });

  it("handlePasteAsCodeBlock early-returns when readOnly", async () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} readOnly t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsCodeBlock"));
    });

    expect(mockReadTextFromClipboard).not.toHaveBeenCalled();
  });

  it("handlePasteAsMarkdown inserts markdown text", async () => {
    mockReadTextFromClipboard.mockResolvedValue("**bold**");
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsMarkdown"));
    });

    expect(editor.chain).toHaveBeenCalled();
  });

  it("handlePasteAsMarkdown calls boxTableToMarkdown when text has box table", async () => {
    mockContainsBoxTable.mockReturnValue(true);
    mockBoxTableToMarkdown.mockReturnValue("| a | b |");
    mockReadTextFromClipboard.mockResolvedValue("┌─┐");
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsMarkdown"));
    });

    expect(mockContainsBoxTable).toHaveBeenCalledWith("┌─┐");
    expect(mockBoxTableToMarkdown).toHaveBeenCalledWith("┌─┐");
  });

  it("handlePasteAsMarkdown posts message to __vscode when clipboard is empty", async () => {
    mockReadTextFromClipboard.mockResolvedValue(null);
    const postMessage = jest.fn();
    (window as any).__vscode = { postMessage };
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsMarkdown"));
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "readClipboard" });
    delete (window as any).__vscode;
  });

  it("handlePasteAsMarkdown early-returns when editor is not editable", async () => {
    const editor = createMockEditor({ isEditable: false });
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByText("pasteAsMarkdown"));
    });

    expect(mockReadTextFromClipboard).not.toHaveBeenCalled();
  });

  it("handleCut does nothing when editor is not editable", () => {
    const editor = createMockEditor({ isEditable: false });
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    act(() => {
      fireEvent.click(screen.getByText("cut"));
    });

    expect(mockPerformBlockCopy).not.toHaveBeenCalled();
  });

  it("vscode-paste-markdown event triggers insertMarkdownText", () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-paste-markdown", { detail: "# Hello" }));
    });

    expect(editor.chain).toHaveBeenCalled();
  });

  it("vscode-paste-markdown event is ignored when editor is not editable", () => {
    const editor = createMockEditor({ isEditable: false });
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-paste-markdown", { detail: "# Hello" }));
    });

    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("vscode-paste-codeblock event inserts code block content", () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-paste-codeblock", { detail: "console.log('hi')" }));
    });

    expect(editor.chain).toHaveBeenCalled();
  });

  it("vscode-paste-codeblock event is ignored when editor is not editable", () => {
    const editor = createMockEditor({ isEditable: false });
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-paste-codeblock", { detail: "code" }));
    });

    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("handleClearScreen calls clearContent and closes menu", async () => {
    const clearContentRun = jest.fn();
    const chain = jest.fn().mockReturnValue({
      focus: jest.fn().mockReturnValue({
        clearContent: jest.fn().mockReturnValue({ run: clearContentRun }),
        insertContent: jest.fn().mockReturnValue({ run: jest.fn() }),
      }),
    });
    const editor = createMockEditor({ chain });
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    act(() => {
      fireEvent.click(screen.getByText("clearScreen"));
    });

    expect(chain).toHaveBeenCalled();
    expect(clearContentRun).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("clearScreen")).toBeNull();
    });
  });

  it("handleClearScreen does nothing when editor is not editable", () => {
    const editor = createMockEditor({ isEditable: false });
    renderWithTheme(<EditorContextMenu editor={editor} t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    act(() => {
      fireEvent.click(screen.getByText("clearScreen"));
    });

    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("handleClearScreen is disabled when readOnly", () => {
    const editor = createMockEditor();
    renderWithTheme(<EditorContextMenu editor={editor} readOnly t={t} />);

    act(() => {
      editor.view.dom.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });

    const menuItem = screen.getByText("clearScreen").closest("li");
    expect(menuItem?.getAttribute("aria-disabled")).toBe("true");
  });

  it("cleans up event listeners on unmount", () => {
    const editor = createMockEditor();
    const removeSpy = jest.spyOn(editor.view.dom, "removeEventListener");
    const globalRemoveSpy = jest.spyOn(globalThis, "removeEventListener");

    const { unmount } = renderWithTheme(<EditorContextMenu editor={editor} t={t} />);
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("contextmenu", expect.any(Function));
    expect(globalRemoveSpy).toHaveBeenCalledWith("vscode-paste-markdown", expect.any(Function));
    expect(globalRemoveSpy).toHaveBeenCalledWith("vscode-paste-codeblock", expect.any(Function));

    removeSpy.mockRestore();
    globalRemoveSpy.mockRestore();
  });
});
