/**
 * EditorContextMenu.tsx のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { EditorContextMenu } from "../components/EditorContextMenu";

// モック
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

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe("EditorContextMenu", () => {
  const t = (key: string) => key;

  it("renders without crashing when editor is null", () => {
    renderWithTheme(
      <EditorContextMenu editor={null} t={t} />,
    );
    // Menu should not be open, so no menu items visible
    expect(screen.queryByText("cut")).toBeNull();
  });

  it("renders without crashing with readOnly", () => {
    renderWithTheme(
      <EditorContextMenu editor={null} readOnly t={t} />,
    );
    expect(screen.queryByText("cut")).toBeNull();
  });
});
