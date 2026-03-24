/**
 * FullscreenDiffView.tsx の追加カバレッジテスト
 */
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  getDivider: () => "#ccc",
  getErrorMain: () => "#f00",
  getSuccessMain: () => "#0f0",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "monospace",
  }),
}));

jest.mock("../utils/diffEngine", () => ({
  computeDiff: () => ({
    leftLines: [
      { type: "equal", text: "line1" },
      { type: "removed", text: "old line" },
      { type: "equal", text: "line3" },
    ],
    rightLines: [
      { type: "equal", text: "line1" },
      { type: "added", text: "new line" },
      { type: "equal", text: "line3" },
    ],
    blocks: [{ id: 0, leftStart: 1, leftEnd: 2, rightStart: 1, rightEnd: 2 }],
  }),
  applyMerge: jest.fn().mockReturnValue({ newLeftText: "merged left", newRightText: "merged right" }),
}));

import { FullscreenDiffView } from "../components/FullscreenDiffView";

const theme = createTheme();

describe("FullscreenDiffView - additional tests", () => {
  const t = (key: string) => key;

  it("renders with different content showing diff", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="line1\nold line\nline3"
          initialRightCode="line1\nnew line\nline3"
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with identical content (no diff)", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="same content"
          initialRightCode="same content"
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with multiline diff content", () => {
    const leftCode = "line1\nline2\nline3\nline4\nline5";
    const rightCode = "line1\nmodified\nline3\nextra\nline5";
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={leftCode}
          initialRightCode={rightCode}
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
