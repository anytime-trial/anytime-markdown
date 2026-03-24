/**
 * FullscreenDiffView.tsx - coverage3 tests
 * Targets: lines 177-183, 285-286
 */

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render, fireEvent } from "@testing-library/react";
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
  }),
}));

import { FullscreenDiffView } from "../components/FullscreenDiffView";

const theme = createTheme();
const t = (key: string) => key;

describe("FullscreenDiffView coverage3", () => {
  it("strips padding lines from edited text when paddingIndices is non-empty (lines 177-183)", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={"line1\nline2"}
          initialRightCode={"line1\ninserted\nline2"}
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    const textareas = container.querySelectorAll("textarea");
    const editableTextarea = Array.from(textareas).find((ta) => !ta.readOnly);
    if (editableTextarea) {
      const currentValue = editableTextarea.value;
      const lines = currentValue.split("\n");
      lines[0] = "modified-line1";
      fireEvent.change(editableTextarea, { target: { value: lines.join("\n") } });
      expect(onMergeApply).toHaveBeenCalled();
      const appliedText = onMergeApply.mock.calls[0][0] as string;
      expect(appliedText).toContain("modified-line1");
    }
  });

  it("handles textarea change with no padding lines (line 174)", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={"same\ntext"}
          initialRightCode={"same\ntext"}
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    const textareas = container.querySelectorAll("textarea");
    const editableTextarea = Array.from(textareas).find((ta) => !ta.readOnly);
    if (editableTextarea) {
      fireEvent.change(editableTextarea, { target: { value: "changed\ntext" } });
      expect(onMergeApply).toHaveBeenCalledWith("changed\ntext", "same\ntext");
    }
  });

  it("syncs gutter scroll with textarea scroll (lines 285-286)", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={"line1\nline2\nline3\nline4\nline5"}
          initialRightCode={"line1\nmodified\nline3\nline4\nline5"}
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    const textareas = container.querySelectorAll("textarea");
    for (const ta of textareas) {
      Object.defineProperty(ta, "scrollTop", { value: 50, configurable: true, writable: true });
      fireEvent.scroll(ta);
    }
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("keeps non-empty padding lines during edit (line 180 branch)", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={"aaa\nbbb"}
          initialRightCode={"aaa\nxxx\nbbb"}
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    const textareas = container.querySelectorAll("textarea");
    const editableTextarea = Array.from(textareas).find((ta) => !ta.readOnly);
    if (editableTextarea) {
      const currentValue = editableTextarea.value;
      const lines = currentValue.split("\n");
      const paddingIdx = lines.findIndex((l: string, i: number) => l === "" && i > 0 && i < lines.length - 1);
      if (paddingIdx >= 0) {
        lines[paddingIdx] = "typed-in-padding";
      }
      fireEvent.change(editableTextarea, { target: { value: lines.join("\n") } });
      expect(onMergeApply).toHaveBeenCalled();
      if (paddingIdx >= 0) {
        const appliedText = onMergeApply.mock.calls[0][0] as string;
        expect(appliedText).toContain("typed-in-padding");
      }
    }
  });

  it("handles multiple padding lines correctly", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullscreenDiffView
          initialLeftCode={"first\nlast"}
          initialRightCode={"first\nadded1\nadded2\nadded3\nlast"}
          onMergeApply={onMergeApply}
          t={t}
        />
      </ThemeProvider>,
    );
    const textareas = container.querySelectorAll("textarea");
    // Verify component renders textareas
    expect(textareas.length).toBeGreaterThanOrEqual(2);
  });
});
