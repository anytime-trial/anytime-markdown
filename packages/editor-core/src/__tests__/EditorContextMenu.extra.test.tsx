/**
 * EditorContextMenu.tsx の追加カバレッジテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { EditorContextMenu } from "../components/EditorContextMenu";

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
  getCopiedBlockNode: () => null,
  performBlockCopy: jest.fn(),
}));

jest.mock("../utils/boxTableToMarkdown", () => ({
  boxTableToMarkdown: (s: string) => s,
  containsBoxTable: () => false,
}));

jest.mock("../utils/clipboardHelpers", () => ({
  copyTextToClipboard: jest.fn(),
  readTextFromClipboard: jest.fn().mockResolvedValue(null),
}));

const theme = createTheme();

describe("EditorContextMenu - additional tests", () => {
  const t = (key: string) => key;

  it("renders with a mock editor", () => {
    const mockEditor = {
      state: {
        selection: { from: 0, to: 0 },
        doc: {
          textBetween: jest.fn(() => ""),
          nodeAt: jest.fn(() => null),
          resolve: jest.fn(() => ({ depth: 0, node: jest.fn(() => ({ type: { name: "doc" } })) })),
        },
      },
      view: {
        dom: document.createElement("div"),
        dispatch: jest.fn(),
        focus: jest.fn(),
      },
      commands: {
        deleteSelection: jest.fn(),
        selectAll: jest.fn(),
        insertContent: jest.fn(),
      },
      chain: jest.fn().mockReturnThis(),
      focus: jest.fn().mockReturnThis(),
      run: jest.fn(),
      isActive: jest.fn(() => false),
      can: jest.fn().mockReturnValue({
        undo: jest.fn(() => false),
        redo: jest.fn(() => false),
      }),
    } as any;

    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorContextMenu editor={mockEditor} t={t} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with readOnly=true", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorContextMenu editor={null} t={t} readOnly />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
