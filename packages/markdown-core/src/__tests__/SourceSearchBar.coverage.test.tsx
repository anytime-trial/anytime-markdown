/**
 * SourceSearchBar.tsx のカバレッジテスト
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getDivider: () => "#ccc",
  getErrorMain: () => "#f44336",
  getPrimaryContrast: () => "#fff",
  getPrimaryDark: () => "#1565c0",
  getPrimaryLight: () => "#42a5f5",
  getPrimaryMain: () => "#1976d2",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SEARCH_COUNTER_FONT_SIZE: 11,
  SEARCH_INPUT_FONT_SIZE: 13,
}));

jest.mock("../constants/zIndex", () => ({
  Z_TOOLBAR: 100,
}));

import { SourceSearchBar } from "../components/SourceSearchBar";

const theme = createTheme();
const t = (key: string, values?: Record<string, string | number>) => {
  if (values) return `${key}: ${JSON.stringify(values)}`;
  return key;
};

function createSearchState(overrides: Partial<Record<string, any>> = {}) {
  return {
    searchTerm: "",
    setSearchTerm: jest.fn(),
    replaceTerm: "",
    setReplaceTerm: jest.fn(),
    matches: [] as any[],
    currentIndex: 0,
    goToNext: jest.fn(),
    goToPrev: jest.fn(),
    caseSensitive: false,
    toggleCaseSensitive: jest.fn(),
    replaceCurrent: jest.fn(),
    replaceAll: jest.fn(),
    searchInputRef: { current: null },
    ...overrides,
  };
}

function renderBar(props: Partial<{ search: any; onClose: jest.Mock }> = {}) {
  const defaultProps = {
    search: createSearchState(),
    onClose: jest.fn(),
    t,
    ...props,
  };
  return render(
    <ThemeProvider theme={theme}>
      <SourceSearchBar {...defaultProps} />
    </ThemeProvider>,
  );
}

describe("SourceSearchBar", () => {
  it("renders search input", () => {
    renderBar();
    expect(screen.getByLabelText("searchPlaceholder")).toBeTruthy();
  });

  it("shows match count when search term is set with results", () => {
    renderBar({
      search: createSearchState({
        searchTerm: "hello",
        matches: [{ start: 0, end: 5 }, { start: 10, end: 15 }],
        currentIndex: 0,
      }),
    });
    // Should show results count via aria-live
    expect(screen.getByText(/searchResults/)).toBeTruthy();
  });

  it("shows no results message when search term has no matches", () => {
    renderBar({
      search: createSearchState({
        searchTerm: "xyz",
        matches: [],
      }),
    });
    expect(screen.getByText("noResults")).toBeTruthy();
  });

  it("shows clear button when search term is set", () => {
    renderBar({
      search: createSearchState({ searchTerm: "hello" }),
    });
    expect(screen.getByLabelText("clearSearch")).toBeTruthy();
  });

  it("clears search term on clear button click", () => {
    const search = createSearchState({ searchTerm: "hello" });
    renderBar({ search });
    fireEvent.click(screen.getByLabelText("clearSearch"));
    expect(search.setSearchTerm).toHaveBeenCalledWith("");
  });

  it("Enter key goes to next match", () => {
    const search = createSearchState({ searchTerm: "hello", matches: [{}] });
    renderBar({ search });
    fireEvent.keyDown(screen.getByLabelText("searchPlaceholder"), { key: "Enter" });
    expect(search.goToNext).toHaveBeenCalled();
  });

  it("Shift+Enter goes to previous match", () => {
    const search = createSearchState({ searchTerm: "hello", matches: [{}] });
    renderBar({ search });
    fireEvent.keyDown(screen.getByLabelText("searchPlaceholder"), { key: "Enter", shiftKey: true });
    expect(search.goToPrev).toHaveBeenCalled();
  });

  it("Escape closes search bar", () => {
    const onClose = jest.fn();
    renderBar({ onClose });
    fireEvent.keyDown(screen.getByLabelText("searchPlaceholder"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("close button calls onClose", () => {
    const onClose = jest.fn();
    renderBar({ onClose });
    fireEvent.click(screen.getByLabelText("close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles case sensitive", () => {
    const search = createSearchState();
    renderBar({ search });
    fireEvent.click(screen.getByLabelText("caseSensitive"));
    expect(search.toggleCaseSensitive).toHaveBeenCalled();
  });

  it("prev/next buttons call goToPrev/goToNext", () => {
    const search = createSearchState({
      searchTerm: "a",
      matches: [{}],
    });
    renderBar({ search });
    fireEvent.click(screen.getByLabelText("prevMatch"));
    expect(search.goToPrev).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("nextMatch"));
    expect(search.goToNext).toHaveBeenCalled();
  });

  it("toggles replace row visibility", () => {
    renderBar();
    // Initially replace row is hidden
    expect(screen.queryByLabelText("replacePlaceholder")).toBeNull();
    // Click toggle
    const toggleButtons = screen.getAllByLabelText("replace");
    fireEvent.click(toggleButtons[0]);
    // Now replace input should be visible
    expect(screen.getByLabelText("replacePlaceholder")).toBeTruthy();
  });

  it("replace row renders when toggled", () => {
    const search = createSearchState({
      searchTerm: "a",
      matches: [{}],
    });
    renderBar({ search });
    // Open replace row
    const toggleBtns = screen.getAllByLabelText("replace");
    fireEvent.click(toggleBtns[0]);
    // Replace input should now be visible
    expect(screen.getByLabelText("replacePlaceholder")).toBeTruthy();
  });

  it("Escape in replace input closes bar", () => {
    const onClose = jest.fn();
    renderBar({ onClose });
    // Open replace row
    const toggleButtons = screen.getAllByLabelText("replace");
    fireEvent.click(toggleButtons[0]);
    fireEvent.keyDown(screen.getByLabelText("replacePlaceholder"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("case sensitive button shows active state", () => {
    renderBar({
      search: createSearchState({ caseSensitive: true }),
    });
    const csBtn = screen.getByLabelText("caseSensitive");
    expect(csBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
