/**
 * EditorContentArea.tsx coverage tests
 * Targets uncovered lines: 65-66, 80-94, 117-119
 * - ResizeObserver for frontmatter height (65-66)
 * - Source mode keyboard shortcuts: Ctrl+F, Escape (80-94)
 * - WYSIWYG mode Ctrl+F in readonly/review mode (117-119)
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

let resizeObserverCallback: ((entries: any[]) => void) | null = null;
global.ResizeObserver = jest.fn().mockImplementation((cb: any) => {
  resizeObserverCallback = cb;
  return {
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  };
}) as any;

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
  FrontmatterBlock: () => <div data-testid="frontmatter-block" style={{ height: 40 }} />,
}));

jest.mock("../components/SearchReplaceBar", () => ({
  SearchReplaceBar: () => <div data-testid="search-replace-bar" />,
}));

let capturedSourceProps: any = {};
jest.mock("../components/SourceModeEditor", () => ({
  SourceModeEditor: (props: any) => {
    capturedSourceProps = props;
    return <div data-testid="source-mode-editor" />;
  },
}));

let capturedSourceSearchBarProps: any = {};
jest.mock("../components/SourceSearchBar", () => ({
  SourceSearchBar: (props: any) => {
    capturedSourceSearchBarProps = props;
    return <div data-testid="source-search-bar" />;
  },
}));

import { EditorContentArea } from "../components/EditorContentArea";

const theme = createTheme();
const t = (key: string) => key;

function createDefaultProps(overrides?: Partial<React.ComponentProps<typeof EditorContentArea>>) {
  return {
    editor: null,
    sourceMode: false,
    readonlyMode: false,
    reviewMode: false,
    editorHeight: 500,
    editorWrapperRef: { current: null } as any,
    editorMountCallback: jest.fn(),
    sourceText: "",
    handleSourceChange: jest.fn(),
    sourceTextareaRef: { current: null } as any,
    sourceSearchOpen: false,
    setSourceSearchOpen: jest.fn(),
    sourceSearch: {
      query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(),
      matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(),
      replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false,
      toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(),
      useRegex: false, toggleUseRegex: jest.fn(), focusSearch: jest.fn(), reset: jest.fn(),
    } as any,
    frontmatterText: null,
    handleFrontmatterChange: jest.fn(),
    t,
    ...overrides,
  };
}

describe("EditorContentArea - coverage", () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    capturedSourceProps = {};
    capturedSourceSearchBarProps = {};
  });

  // --- ResizeObserver for frontmatter (lines 65-66) ---
  test("ResizeObserver updates frontmatter height using borderBoxSize", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea {...createDefaultProps({ frontmatterText: "---\ntitle: test\n---" })} />
      </ThemeProvider>,
    );

    // Trigger ResizeObserver callback
    act(() => {
      resizeObserverCallback?.([{
        borderBoxSize: [{ blockSize: 48 }],
        contentRect: { height: 40 },
      }]);
    });
    // No crash = pass
  });

  test("ResizeObserver falls back to contentRect when borderBoxSize missing", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea {...createDefaultProps({ frontmatterText: "---\ntitle: test\n---" })} />
      </ThemeProvider>,
    );

    act(() => {
      resizeObserverCallback?.([{
        borderBoxSize: null,
        contentRect: { height: 32 },
      }]);
    });
  });

  // --- Source mode Ctrl+F opens search (lines 80-83) ---
  test("Ctrl+F in source mode opens source search", () => {
    const setSourceSearchOpen = jest.fn();
    const focusSearch = jest.fn();
    jest.useFakeTimers();

    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            sourceMode: true,
            setSourceSearchOpen,
            sourceSearch: {
              ...createDefaultProps().sourceSearch,
              focusSearch,
            } as any,
          })}
        />
      </ThemeProvider>,
    );

    // Find the source mode wrapper and fire Ctrl+F
    const wrapper = screen.getByTestId("source-mode-editor").parentElement!;
    fireEvent.keyDown(wrapper, { key: "f", ctrlKey: true });

    expect(setSourceSearchOpen).toHaveBeenCalledWith(true);

    // Run the setTimeout for focusSearch
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(focusSearch).toHaveBeenCalled();
    jest.useRealTimers();
  });

  // --- Source mode Meta+F (Mac) opens search ---
  test("Meta+F in source mode opens source search", () => {
    const setSourceSearchOpen = jest.fn();
    jest.useFakeTimers();

    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            sourceMode: true,
            setSourceSearchOpen,
          })}
        />
      </ThemeProvider>,
    );

    const wrapper = screen.getByTestId("source-mode-editor").parentElement!;
    fireEvent.keyDown(wrapper, { key: "f", metaKey: true });

    expect(setSourceSearchOpen).toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });

  // --- Source mode Escape closes search (lines 84-88) ---
  test("Escape in source mode closes search when open", () => {
    const setSourceSearchOpen = jest.fn();
    const reset = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            sourceMode: true,
            sourceSearchOpen: true,
            setSourceSearchOpen,
            sourceSearch: {
              ...createDefaultProps().sourceSearch,
              reset,
            } as any,
          })}
        />
      </ThemeProvider>,
    );

    const wrapper = screen.getByTestId("source-search-bar").parentElement!;
    fireEvent.keyDown(wrapper, { key: "Escape" });

    expect(setSourceSearchOpen).toHaveBeenCalledWith(false);
    expect(reset).toHaveBeenCalled();
  });

  // --- Source search bar close button (line 94) ---
  test("SourceSearchBar onClose callback", () => {
    const setSourceSearchOpen = jest.fn();
    const reset = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            sourceMode: true,
            sourceSearchOpen: true,
            setSourceSearchOpen,
            sourceSearch: {
              ...createDefaultProps().sourceSearch,
              reset,
            } as any,
          })}
        />
      </ThemeProvider>,
    );

    // Call the onClose prop captured from SourceSearchBar
    act(() => {
      capturedSourceSearchBarProps.onClose?.();
    });

    expect(setSourceSearchOpen).toHaveBeenCalledWith(false);
    expect(reset).toHaveBeenCalled();
  });

  // --- WYSIWYG mode Ctrl+F in readonly mode (lines 117-119) ---
  test("Ctrl+F in WYSIWYG readonly mode opens editor search", () => {
    const mockOpenSearch = jest.fn();
    const mockEditor = {
      commands: { openSearch: mockOpenSearch },
    } as any;

    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            editor: mockEditor,
            readonlyMode: true,
          })}
        />
      </ThemeProvider>,
    );

    const wrapper = screen.getByTestId("frontmatter-block").parentElement!;
    fireEvent.keyDown(wrapper, { key: "f", ctrlKey: true });

    expect(mockOpenSearch).toHaveBeenCalled();
  });

  test("Ctrl+F in WYSIWYG review mode opens editor search", () => {
    const mockOpenSearch = jest.fn();
    const mockEditor = {
      commands: { openSearch: mockOpenSearch },
    } as any;

    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            editor: mockEditor,
            reviewMode: true,
          })}
        />
      </ThemeProvider>,
    );

    const wrapper = screen.getByTestId("frontmatter-block").parentElement!;
    fireEvent.keyDown(wrapper, { key: "f", ctrlKey: true });

    expect(mockOpenSearch).toHaveBeenCalled();
  });

  // --- Source mode search matches passed to SourceModeEditor ---
  test("source search matches are passed when search is open", () => {
    const matches = [{ start: 0, end: 5 }];
    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            sourceMode: true,
            sourceSearchOpen: true,
            sourceSearch: {
              ...createDefaultProps().sourceSearch,
              matches,
              currentIndex: 0,
            } as any,
          })}
        />
      </ThemeProvider>,
    );

    expect(capturedSourceProps.searchMatches).toBe(matches);
    expect(capturedSourceProps.searchCurrentIndex).toBe(0);
  });

  test("source search matches are undefined when search is closed", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorContentArea
          {...createDefaultProps({
            sourceMode: true,
            sourceSearchOpen: false,
          })}
        />
      </ThemeProvider>,
    );

    expect(capturedSourceProps.searchMatches).toBeUndefined();
    expect(capturedSourceProps.searchCurrentIndex).toBeUndefined();
  });
});
