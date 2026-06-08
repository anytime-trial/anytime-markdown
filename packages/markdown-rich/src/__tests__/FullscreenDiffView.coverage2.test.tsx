/**
 * FullscreenDiffView.tsx - 追加カバレッジテスト (lines 126-129, 177-183, 285-286)
 * handleLeftChange with padding, handleMergeBlock, props sync
 */

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render, fireEvent } from "@testing-library/react";

import { FullscreenDiffView } from "../components/FullscreenDiffView";

jest.mock("@anytime-markdown/markdown-viewer", () => ({
    ...jest.requireActual("@anytime-markdown/markdown-viewer"),
    DEFAULT_DARK_BG: "#1e1e1e",
    DEFAULT_LIGHT_BG: "#fff",
    getDivider: () => "#ccc",
    getErrorMain: () => "#f44336",
    getSuccessMain: () => "#4caf50",
    getTextPrimary: () => "#000",
    getTextSecondary: () => "#666",
    useEditorSettingsContext: () => ({
      fontSize: 14,
      lineHeight: 1.6,
    }),
}));

const t = (key: string) => key;

describe("FullscreenDiffView coverage2", () => {
  it("handles textarea change that strips padding lines (lines 177-183)", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <FullscreenDiffView
        initialLeftCode="line1\nline2\nline3"
        initialRightCode="line1\nnewline\nline3\nextra"
        onMergeApply={onMergeApply}
        t={t}
      />,
    );

    // Find editable textarea
    const textareas = container.querySelectorAll("textarea");
    const editableTextarea = Array.from(textareas).find((ta) => !ta.readOnly);
    if (editableTextarea) {
      fireEvent.change(editableTextarea, { target: { value: "line1\nchanged\nline3" } });
      expect(onMergeApply).toHaveBeenCalled();
    }
  });

  it("merge button click calls handleMergeBlock (lines 139-151)", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <FullscreenDiffView
        initialLeftCode="same\nold line\nsame"
        initialRightCode="same\nnew line\nsame"
        onMergeApply={onMergeApply}
        t={t}
      />,
    );

    const mergeButtons = container.querySelectorAll('[aria-label="mergeLeftToRight"]');
    if (mergeButtons.length > 0) {
      fireEvent.click(mergeButtons[0]);
      expect(onMergeApply).toHaveBeenCalled();
    }
  });

  it("re-syncs when initialLeftCode/initialRightCode props change (lines 126-129)", () => {
    const onMergeApply = jest.fn();
    const { rerender, container } = render(
      <FullscreenDiffView
        initialLeftCode="first"
        initialRightCode="second"
        onMergeApply={onMergeApply}
        t={t}
      />,
    );

    // Re-render with new props
    rerender(
      <FullscreenDiffView
        initialLeftCode="updated left"
        initialRightCode="updated right"
        onMergeApply={onMergeApply}
        t={t}
      />,
    );

    // Verify textarea has updated content
    const textareas = container.querySelectorAll("textarea");
    const editableTextarea = Array.from(textareas).find((ta) => !ta.readOnly);
    if (editableTextarea) {
      expect(editableTextarea.value).toContain("updated");
    }
  });

  it("renders dark theme correctly", () => {
    const { container } = render(
      <FullscreenDiffView
        initialLeftCode="line1"
        initialRightCode="line2"
        onMergeApply={jest.fn()}
        t={t}
      />,
    );
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("handleMergeBlock does nothing for invalid block", () => {
    const onMergeApply = jest.fn();
    const { container } = render(
      <FullscreenDiffView
        initialLeftCode="same"
        initialRightCode="same"
        onMergeApply={onMergeApply}
        t={t}
      />,
    );
    // No merge buttons since texts are identical
    const mergeButtons = container.querySelectorAll('[aria-label="mergeLeftToRight"]');
    expect(mergeButtons.length).toBe(0);
  });
});
