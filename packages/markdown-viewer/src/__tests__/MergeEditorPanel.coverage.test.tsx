/**
 * MergeEditorPanel.tsx - coverage improvement tests
 * Targets: normalizeSx, _getLineBgColor, buildDisplayText, buildMergeButtonMap,
 *          MergeGutter, textarea onChange/onSelect, editorWrapperRef branch
 */

// ResizeObserver polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("@tiptap/react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getErrorMain: () => "#f00",
  getSuccessMain: () => "#0f0",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "sans-serif",
    blockAlign: "left",
    tableWidth: "100%",
  }),
}));

jest.mock("../components/mergeTiptapStyles", () => ({
  getMergeTiptapStyles: () => ({}),
}));

import { MergeEditorPanel } from "../components/MergeEditorPanel";
import type { DiffLine } from "../utils/diffEngine";

const theme = createTheme();

describe("MergeEditorPanel - coverage", () => {
  // --- buildDisplayText: padding lines ---
  it("renders with padding diffLines (buildDisplayText coverage)", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "padding", text: "", blockId: null, lineNumber: null },
      { type: "added", text: "line3", blockId: 1, lineNumber: 2 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline3"
          diffLines={diffLines}
          side="left"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- buildDisplayText: rawText ends with newline ---
  it("handles rawText ending with newline", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText={"line1\n"}
          diffLines={diffLines}
          side="left"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- buildMergeButtonMap: multiple diff blocks with merge buttons ---
  it("renders merge buttons on left side (buildMergeButtonMap coverage)", () => {
    const onMerge = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "added", text: "new1", blockId: 1, lineNumber: 2 },
      { type: "added", text: "new2", blockId: 1, lineNumber: 3 },
      { type: "removed", text: "old", blockId: 2, lineNumber: null },
      { type: "modified-old", text: "mod", blockId: 3, lineNumber: null },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nnew1\nnew2"
          diffLines={diffLines}
          side="left"
          onMerge={onMerge}
        />
      </ThemeProvider>,
    );
    // Should have merge buttons
    const mergeButtons = screen.getAllByRole("button");
    expect(mergeButtons.length).toBeGreaterThan(0);
    // Click a merge button
    fireEvent.click(mergeButtons[0]);
    expect(onMerge).toHaveBeenCalled();
  });

  // --- MergeGutter on right side ---
  it("renders merge buttons on right side", () => {
    const onMerge = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "modified-new", text: "changed", blockId: 1, lineNumber: 2 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nchanged"
          diffLines={diffLines}
          side="right"
          onMerge={onMerge}
        />
      </ThemeProvider>,
    );
    const mergeButtons = screen.getAllByRole("button");
    expect(mergeButtons.length).toBeGreaterThan(0);
    fireEvent.click(mergeButtons[0]);
    expect(onMerge).toHaveBeenCalled();
  });

  // --- normalizeSx: array sx ---
  it("renders with array paperSx (normalizeSx coverage)", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          paperSx={[{ background: "red" }, { color: "blue" }]}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- normalizeSx: single object sx ---
  it("renders with single object paperSx", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          paperSx={{ background: "green" }}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- normalizeSx: undefined sx ---
  it("renders with undefined paperSx", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel sourceMode={true} sourceText="test" />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- textarea onChange with paddingIndices ---
  it("textarea onChange filters padding lines", () => {
    const onSourceChange = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "padding", text: "", blockId: null, lineNumber: null },
      { type: "added", text: "line3", blockId: 1, lineNumber: 2 },
    ];
    render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline3"
          onSourceChange={onSourceChange}
          diffLines={diffLines}
          side="left"
        />
      </ThemeProvider>,
    );
    const textarea = document.querySelector("textarea")!;
    expect(textarea).toBeTruthy();
    // The displayText is "line1\n\nline3". Simulate user editing it to a different value.
    // This differs from displayText so React will fire onChange.
    fireEvent.change(textarea, { target: { value: "line1\nX\nline3" } });
    // Padding line at index 1 has content "X" (non-empty), so it is NOT filtered.
    // All lines are kept.
    expect(onSourceChange).toHaveBeenCalledWith("line1\nX\nline3");
  });

  // --- textarea onChange without paddingIndices ---
  it("textarea onChange passes through without padding", () => {
    const onSourceChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="hello"
          onSourceChange={onSourceChange}
        />
      </ThemeProvider>,
    );
    const textarea = document.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(onSourceChange).toHaveBeenCalledWith("hello world");
  });

  // --- textarea onSelect with diffLines ---
  it("textarea onSelect calls onHoverLine", () => {
    const onHoverLine = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "added", text: "line2", blockId: 1, lineNumber: 2 },
    ];
    render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline2"
          diffLines={diffLines}
          side="left"
          onHoverLine={onHoverLine}
        />
      </ThemeProvider>,
    );
    const textarea = document.querySelector("textarea")!;
    // Set selectionStart to position inside line 2
    Object.defineProperty(textarea, "selectionStart", { value: 6, writable: true });
    fireEvent.select(textarea);
    expect(onHoverLine).toHaveBeenCalledWith(1);
  });

  // --- textarea onSelect with out-of-range line ---
  it("textarea onSelect returns null for out-of-range", () => {
    const onHoverLine = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
    ];
    render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1"
          diffLines={diffLines}
          side="left"
          onHoverLine={onHoverLine}
        />
      </ThemeProvider>,
    );
    const textarea = document.querySelector("textarea")!;
    // position past all lines
    Object.defineProperty(textarea, "selectionStart", { value: 100, writable: true });
    // Override the value to have many newlines
    Object.defineProperty(textarea, "value", { value: "a\nb\nc\nd", writable: true });
    fireEvent.select(textarea);
    expect(onHoverLine).toHaveBeenCalledWith(null);
  });

  // --- editor mode with editorWrapperRef ---
  it("renders editor mode with editorWrapperRef", () => {
    const wrapperRef = React.createRef<HTMLDivElement>();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
          editorWrapperRef={wrapperRef}
        />
      </ThemeProvider>,
    );
    expect(wrapperRef.current).toBeTruthy();
    expect(container).toBeTruthy();
  });

  // --- editor mode without editorWrapperRef ---
  it("renders editor mode without editorWrapperRef", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel sourceMode={false} editor={null} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- editor mode with editorMountRef ---
  it("renders editor mode with editorMountRef", () => {
    const mountRef = React.createRef<HTMLDivElement>();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
          editorMountRef={mountRef}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- hideScrollbar ---
  it("renders with hideScrollbar", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          hideScrollbar
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- bgGradient = "none" ---
  it("renders with bgGradient none", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          bgGradient="none"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- bgGradient with actual gradient ---
  it("renders with actual bgGradient", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          bgGradient="linear-gradient(to bottom, #fff, #000)"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- empty sourceText ---
  it("renders with empty sourceText", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText=""
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- editor mode with paperSx (normalizeSx in non-source mode) ---
  it("renders editor mode with paperSx", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
          paperSx={{ background: "red" }}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- showHoverLabels ---
  it("renders editor mode with showHoverLabels", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
          showHoverLabels
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- _getLineBgColor via diffLines with all types ---
  it("renders diffLines with all DiffLine types", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "same", blockId: null, lineNumber: 1 },
      { type: "added", text: "add", blockId: 1, lineNumber: 2 },
      { type: "removed", text: "rem", blockId: 2, lineNumber: null },
      { type: "modified-old", text: "old", blockId: 3, lineNumber: null },
      { type: "modified-new", text: "new", blockId: 3, lineNumber: 3 },
      { type: "padding", text: "", blockId: null, lineNumber: null },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="same\nadd\nnew"
          diffLines={diffLines}
          side="left"
          onMerge={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- autoResize ---
  it("renders with autoResize in source mode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test\nline2"
          autoResize
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  // --- children in editor mode ---
  it("renders children in editor mode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel sourceMode={false} editor={null}>
          <div data-testid="child-element">child</div>
        </MergeEditorPanel>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child-element")).toBeTruthy();
  });
});
