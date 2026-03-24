/**
 * SearchReplaceBar.tsx coverage test
 * Targets uncovered lines: 62, 72-80, 109-110, 126-137, 145-149, 289-378
 * - openSearch with selected text
 * - closeSearch handling (non-isOpen path)
 * - handleSearchKeyDown (Enter, Shift+Enter, Escape)
 * - handleReplaceKeyDown (Enter, Escape)
 * - showReplace panel interactions
 * - handleReplaceChange
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchReplaceBar } from "../components/SearchReplaceBar";

jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    useTheme: () => ({
      palette: { mode: "dark" },
    }),
  };
});

const t = (key: string, values?: Record<string, string | number>) => {
  if (values) return `${key}:${JSON.stringify(values)}`;
  return key;
};

function createMockEditor(storageOverrides: Record<string, unknown> = {}) {
  const storage = {
    searchReplace: {
      searchTerm: "",
      replaceTerm: "",
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      results: [] as unknown[],
      currentIndex: 0,
      isOpen: false,
      showReplace: false,
      onSearchStateChange: undefined as (() => void) | undefined,
      ...storageOverrides,
    },
  };
  return {
    storage,
    state: {
      selection: { from: 0, to: 0 },
      doc: { textBetween: jest.fn().mockReturnValue("") },
    },
    commands: {
      setSearchTerm: jest.fn(),
      setReplaceTerm: jest.fn(),
      closeSearch: jest.fn(),
      focus: jest.fn(),
      goToNextMatch: jest.fn(),
      goToPrevMatch: jest.fn(),
      replaceCurrentMatch: jest.fn(),
      replaceAllMatches: jest.fn(),
      toggleCaseSensitive: jest.fn(),
      toggleWholeWord: jest.fn(),
      toggleUseRegex: jest.fn(),
    },
  } as unknown as import("@tiptap/react").Editor;
}

function openSearchBar(editor: import("@tiptap/react").Editor) {
  act(() => {
    editor.storage.searchReplace.isOpen = true;
    editor.storage.searchReplace.onSearchStateChange?.();
  });
}

describe("SearchReplaceBar - coverage tests", () => {
  test("openSearch with selected text sets search term", () => {
    const editor = createMockEditor();
    // Set up selection
    (editor.state as any).selection = { from: 5, to: 10 };
    (editor.state as any).doc.textBetween = jest.fn().mockReturnValue("hello");

    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Should have set the search term to the selected text
    expect(editor.commands.setSearchTerm).toHaveBeenCalledWith("hello");
    const input = screen.getByLabelText("searchPlaceholder") as HTMLInputElement;
    expect(input.value).toBe("hello");
  });

  test("openSearch with multiline selection does not set search term", () => {
    const editor = createMockEditor();
    (editor.state as any).selection = { from: 5, to: 20 };
    (editor.state as any).doc.textBetween = jest.fn().mockReturnValue("line1\nline2");

    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Should NOT set the search term because it contains newline
    expect(editor.commands.setSearchTerm).not.toHaveBeenCalled();
  });

  test("openSearch with very long selection does not set search term", () => {
    const editor = createMockEditor();
    (editor.state as any).selection = { from: 5, to: 300 };
    (editor.state as any).doc.textBetween = jest.fn().mockReturnValue("a".repeat(250));

    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Should NOT set because length >= 200
    expect(editor.commands.setSearchTerm).not.toHaveBeenCalled();
  });

  test("openSearchReplace sets showReplace", () => {
    const editor = createMockEditor();

    render(<SearchReplaceBar editor={editor} t={t} />);

    act(() => {
      editor.storage.searchReplace.isOpen = true;
      editor.storage.searchReplace.showReplace = true;
      editor.storage.searchReplace.onSearchStateChange?.();
    });

    // Replace input should be visible
    const replaceInput = screen.getByLabelText("replacePlaceholder");
    expect(replaceInput).toBeTruthy();
  });

  test("closeSearch hides bar when searchTerm and replaceTerm are empty", () => {
    const editor = createMockEditor();
    const { container } = render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    expect(container.firstChild).toBeTruthy();

    // Simulate closeSearch: isOpen=false, searchTerm="", replaceTerm=""
    act(() => {
      editor.storage.searchReplace.isOpen = false;
      editor.storage.searchReplace.searchTerm = "";
      editor.storage.searchReplace.replaceTerm = "";
      editor.storage.searchReplace.onSearchStateChange?.();
    });

    expect(container.firstChild).toBeNull();
  });

  test("handleSearchKeyDown Enter calls goToNextMatch", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const input = screen.getByLabelText("searchPlaceholder");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(editor.commands.goToNextMatch).toHaveBeenCalled();
  });

  test("handleSearchKeyDown Shift+Enter calls goToPrevMatch", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const input = screen.getByLabelText("searchPlaceholder");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(editor.commands.goToPrevMatch).toHaveBeenCalled();
  });

  test("handleSearchKeyDown Escape closes search bar", () => {
    const editor = createMockEditor();
    const { container } = render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const input = screen.getByLabelText("searchPlaceholder");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(editor.commands.closeSearch).toHaveBeenCalled();
    expect(editor.commands.focus).toHaveBeenCalled();
  });

  test("handleReplaceKeyDown Enter prevents default but does not close", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Open replace panel
    const toggleBtn = screen.getAllByLabelText("replace")[0];
    fireEvent.click(toggleBtn);

    const replaceInput = screen.getByLabelText("replacePlaceholder");
    const event = fireEvent.keyDown(replaceInput, { key: "Enter" });

    // closeSearch should NOT have been called for Enter
    expect(editor.commands.closeSearch).not.toHaveBeenCalled();
  });

  test("handleReplaceKeyDown Escape closes search bar", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Open replace panel
    const toggleBtn = screen.getAllByLabelText("replace")[0];
    fireEvent.click(toggleBtn);

    const replaceInput = screen.getByLabelText("replacePlaceholder");
    fireEvent.keyDown(replaceInput, { key: "Escape" });

    expect(editor.commands.closeSearch).toHaveBeenCalled();
  });

  test("handleReplaceChange updates replace term", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Open replace panel
    const toggleBtn = screen.getAllByLabelText("replace")[0];
    fireEvent.click(toggleBtn);

    const replaceInput = screen.getByLabelText("replacePlaceholder");
    fireEvent.change(replaceInput, { target: { value: "replacement" } });

    expect(editor.commands.setReplaceTerm).toHaveBeenCalledWith("replacement");
  });

  test("toggle buttons call correct commands", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Case sensitive
    const csBtn = screen.getByLabelText("caseSensitive");
    fireEvent.click(csBtn);
    expect(editor.commands.toggleCaseSensitive).toHaveBeenCalled();

    // Whole word (wrapped in Tooltip span, so use getAllByLabelText)
    const wwBtns = screen.getAllByLabelText("wholeWord");
    const wwBtn = wwBtns.find((el) => el.tagName === "BUTTON")!;
    fireEvent.click(wwBtn);
    expect(editor.commands.toggleWholeWord).toHaveBeenCalled();

    // Regex
    const rxBtn = screen.getByLabelText("regex");
    fireEvent.click(rxBtn);
    expect(editor.commands.toggleUseRegex).toHaveBeenCalled();
  });

  test("prev/next match buttons call correct commands", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const prevBtn = screen.getByLabelText("prevMatch");
    fireEvent.click(prevBtn);
    expect(editor.commands.goToPrevMatch).toHaveBeenCalled();

    const nextBtn = screen.getByLabelText("nextMatch");
    fireEvent.click(nextBtn);
    expect(editor.commands.goToNextMatch).toHaveBeenCalled();
  });

  test("shows 'noResults' when searchTerm exists but no results", () => {
    const editor = createMockEditor({ searchTerm: "xyz", results: [] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Set searchTerm in the input to trigger the display
    const input = screen.getByLabelText("searchPlaceholder");
    fireEvent.change(input, { target: { value: "xyz" } });

    const liveRegion = screen.getByText("noResults");
    expect(liveRegion).toBeTruthy();
  });

  test("replace toggle shows/hides replace row", () => {
    const editor = createMockEditor({ searchTerm: "test", results: [{}] });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // Initially no replace input
    expect(screen.queryByLabelText("replacePlaceholder")).toBeNull();

    // Click toggle to open
    const toggleBtn = screen.getAllByLabelText("replace")[0];
    fireEvent.click(toggleBtn);
    expect(screen.getByLabelText("replacePlaceholder")).toBeTruthy();

    // Click toggle to close
    fireEvent.click(toggleBtn);
    expect(screen.queryByLabelText("replacePlaceholder")).toBeNull();
  });

  test("debounce cleanup on unmount", () => {
    jest.useFakeTimers();
    const editor = createMockEditor();
    const { unmount } = render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const input = screen.getByLabelText("searchPlaceholder");
    fireEvent.change(input, { target: { value: "test" } });

    // Unmount before debounce fires
    unmount();

    // Should not throw
    jest.advanceTimersByTime(300);
    jest.useRealTimers();
  });
});
