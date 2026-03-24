/**
 * SourceSearchBar.tsx のスモークテスト
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getDivider: () => "#ccc",
  getErrorMain: () => "#f00",
  getPrimaryContrast: () => "#fff",
  getPrimaryDark: () => "#115293",
  getPrimaryLight: () => "#4791db",
  getPrimaryMain: () => "#1976d2",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SEARCH_COUNTER_FONT_SIZE: 11,
  SEARCH_INPUT_FONT_SIZE: 13,
}));

jest.mock("../constants/zIndex", () => ({
  Z_TOOLBAR: 1200,
}));

import { SourceSearchBar } from "../components/SourceSearchBar";

const theme = createTheme();

describe("SourceSearchBar", () => {
  const t = (key: string) => key;
  const mockSearch = {
    query: "",
    setQuery: jest.fn(),
    replaceText: "",
    setReplaceText: jest.fn(),
    matches: [],
    currentIndex: 0,
    goToNext: jest.fn(),
    goToPrev: jest.fn(),
    replace: jest.fn(),
    replaceAll: jest.fn(),
    caseSensitive: false,
    toggleCaseSensitive: jest.fn(),
    wholeWord: false,
    toggleWholeWord: jest.fn(),
    useRegex: false,
    toggleUseRegex: jest.fn(),
  };

  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SourceSearchBar
          search={mockSearch as any}
          onClose={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with matches", () => {
    const searchWithMatches = {
      ...mockSearch,
      query: "test",
      matches: [{ from: 0, to: 4 }, { from: 10, to: 14 }],
      currentIndex: 0,
    };
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SourceSearchBar
          search={searchWithMatches as any}
          onClose={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
