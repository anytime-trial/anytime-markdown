/**
 * FullscreenDiffView.tsx のスモークテスト
 */

// ResizeObserver polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { FullscreenDiffView } from "../components/FullscreenDiffView";

jest.mock("@anytime-markdown/markdown-core", () => ({
    ...jest.requireActual("@anytime-markdown/markdown-core"),
    DEFAULT_DARK_BG: "#1e1e1e",
    DEFAULT_LIGHT_BG: "#fff",
    getDivider: () => "#ccc",
    getErrorMain: () => "#f00",
    getSuccessMain: () => "#0f0",
    getTextPrimary: () => "#000",
    getTextSecondary: () => "#666",
    useEditorSettingsContext: () => ({
      fontSize: 14,
      lineHeight: 1.6,
      fontFamily: "monospace",
    }),
    computeDiff: () => ({ leftLines: [], rightLines: [], blocks: [] }),
    applyMerge: jest.fn().mockReturnValue({ newLeftText: "", newRightText: "" }),
}));

const theme = createTheme();

describe("FullscreenDiffView", () => {
  const t = (key: string) => key;

  it("renders without crashing with empty code", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode=""
          initialRightCode=""
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with different left and right code", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="line1\nline2"
          initialRightCode="line1\nline3"
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
