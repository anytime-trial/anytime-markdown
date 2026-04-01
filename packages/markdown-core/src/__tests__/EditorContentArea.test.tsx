/**
 * EditorContentArea.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@tiptap/react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "sans-serif",
    blockAlign: "left",
    tableWidth: "100%",
    paperSize: "off",
    paperMargin: 20,
    editorBg: "white",
  }),
}));

jest.mock("../styles/editorStyles", () => ({
  getEditorPaperSx: () => ({}),
}));

jest.mock("../constants/colors", () => ({
  getBgPaper: () => "#fff",
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
  getActionHover: () => "rgba(0,0,0,0.04)",
}));

jest.mock("../constants/dimensions", () => ({
  CONTEXT_MENU_FONT_SIZE: 13,
  SHORTCUT_HINT_FONT_SIZE: 11,
}));

jest.mock("../components/EditorContextMenu", () => ({
  EditorContextMenu: () => <div data-testid="context-menu" />,
}));

jest.mock("../components/FrontmatterBlock", () => ({
  FrontmatterBlock: () => <div data-testid="frontmatter-block" />,
}));

jest.mock("../components/SearchReplaceBar", () => ({
  SearchReplaceBar: () => <div data-testid="search-replace-bar" />,
}));

jest.mock("../components/SourceModeEditor", () => ({
  SourceModeEditor: () => <div data-testid="source-mode-editor" />,
}));

jest.mock("../components/SourceSearchBar", () => ({
  SourceSearchBar: () => <div data-testid="source-search-bar" />,
}));

const mockEditorMode = {
  sourceMode: false,
  readonlyMode: false,
  reviewMode: false,
  inlineMergeOpen: false,
  sideToolbar: false,
  explorerOpen: false,
  noScroll: false,
};
jest.mock("../contexts/EditorModeContext", () => ({
  useEditorMode: () => mockEditorMode,
}));

import { EditorContentArea } from "../components/EditorContentArea";

const theme = createTheme();
const t = (key: string) => key;

describe("EditorContentArea", () => {
  beforeEach(() => {
    mockEditorMode.sourceMode = false;
    mockEditorMode.readonlyMode = false;
    mockEditorMode.reviewMode = false;
  });

  const defaultProps = {
    editor: null,
    editorHeight: 500,
    editorWrapperRef: { current: null } as any,
    editorMountCallback: jest.fn(),
    sourceText: "",
    handleSourceChange: jest.fn(),
    sourceTextareaRef: { current: null } as any,
    sourceSearchOpen: false,
    setSourceSearchOpen: jest.fn(),
    sourceSearch: { query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any,
    frontmatterText: null,
    handleFrontmatterChange: jest.fn(),
    t,
  };

  it("renders in WYSIWYG mode without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorContentArea {...defaultProps} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders in source mode without crashing", () => {
    mockEditorMode.sourceMode = true;
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorContentArea {...defaultProps} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
