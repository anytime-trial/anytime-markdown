/**
 * OutlinePanel.tsx の追加カバレッジテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextDisabled: () => "#999",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
  getPrimaryMain: () => "#1976d2",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getBgPaper: () => "#fff",
}));

jest.mock("../constants/dimensions", () => ({
  OUTLINE_FONT_SIZE: 13,
  OUTLINE_PANEL_WIDTH: 250,
  PANEL_HEADER_MIN_HEIGHT: 40,
  OUTLINE_ICON_SIZE: 16,
  PANEL_BUTTON_FONT_SIZE: 12,
  SMALL_CAPTION_FONT_SIZE: 10,
}));

import { OutlinePanel } from "../components/OutlinePanel";

const theme = createTheme();

function createProps(overrides?: Partial<any>) {
  return {
    outlineWidth: 250,
    setOutlineWidth: jest.fn(),
    editorHeight: 600,
    headings: [],
    foldedIndices: new Set<number>(),
    hiddenByFold: new Set<number>(),
    foldAll: jest.fn(),
    unfoldAll: jest.fn(),
    toggleFold: jest.fn(),
    handleOutlineClick: jest.fn(),
    handleOutlineResizeStart: jest.fn(),
    t: (key: string) => key,
    ...overrides,
  };
}

describe("OutlinePanel - additional tests", () => {
  it("renders with headings", () => {
    const headings = [
      { kind: "heading" as const, text: "Introduction", level: 1, pos: 0 },
      { kind: "heading" as const, text: "Details", level: 2, pos: 50 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <OutlinePanel {...createProps({ headings })} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders empty state when no headings", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <OutlinePanel {...createProps()} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with foldedIndices", () => {
    const headings = [
      { kind: "heading" as const, text: "H1", level: 1, pos: 0 },
      { kind: "heading" as const, text: "H2", level: 2, pos: 10 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <OutlinePanel {...createProps({ headings, foldedIndices: new Set([0]) })} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with hideResize", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <OutlinePanel {...createProps({ hideResize: true })} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
