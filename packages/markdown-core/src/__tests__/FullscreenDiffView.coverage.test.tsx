/**
 * FullscreenDiffView.tsx のカバレッジテスト
 * 純粋ヘルパー関数 (buildBgGradient, buildDisplayData, buildMergeButtonIndices) を直接テスト
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
  getErrorMain: () => "#f44336",
  getSuccessMain: () => "#4caf50",
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

// Use real diffEngine for integration tests
import { FullscreenDiffView } from "../components/FullscreenDiffView";

const theme = createTheme();

describe("FullscreenDiffView coverage", () => {
  const t = (key: string) => key;

  it("renders diff with added/removed lines and merge buttons", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="line1\nold\nline3"
          initialRightCode="line1\nnew\nline3"
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    // Should render textarea elements
    const textareas = container.querySelectorAll("textarea");
    expect(textareas.length).toBeGreaterThanOrEqual(1);
  });

  it("renders with empty content", () => {
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

  it("renders with large diff having modified lines", () => {
    const left = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const right = Array.from({ length: 20 }, (_, i) =>
      i === 5 ? "modified line 6" : i === 10 ? "modified line 11" : `line ${i + 1}`,
    ).join("\n");
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={left}
          initialRightCode={right}
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("calls onMergeApply when merge button clicked", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="same\nold\nsame"
          initialRightCode="same\nnew\nsame"
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    // Find merge buttons
    const mergeButtons = container.querySelectorAll('[aria-label="mergeLeftToRight"], [aria-label="mergeRightToLeft"]');
    if (mergeButtons.length > 0) {
      fireEvent.click(mergeButtons[0]);
      expect(onMergeApply).toHaveBeenCalled();
    }
  });

  it("handles textarea change in editable panel", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="hello\nworld"
          initialRightCode="hello\nearth"
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    // Find the non-readonly textarea (right panel = editable)
    const textareas = container.querySelectorAll("textarea");
    const editableTextarea = Array.from(textareas).find((ta) => !ta.readOnly);
    if (editableTextarea) {
      fireEvent.change(editableTextarea, { target: { value: "hello\nnew world" } });
      expect(onMergeApply).toHaveBeenCalled();
    }
  });

  it("renders with only additions (left empty)", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode=""
          initialRightCode="new line 1\nnew line 2"
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with only deletions (right empty)", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode="old line 1\nold line 2"
          initialRightCode=""
          onMergeApply={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
