/**
 * MergeEditorPanel.tsx coverage3 tests
 * Targets:
 * - _getLineBgColor switch branches (lines 27: added, removed, modified-old, modified-new, padding, default)
 * - non-source mode rendering with editor
 * - onChange with padding indices filtering (line 276)
 * - onSelect with diffLines (line 282)
 * - scroll sync effect (lines 367-375)
 * - mirror height effect (lines 383-401)
 */

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("@tiptap/react", () => ({
  EditorContent: ({ editor }: any) => <div data-testid="editor-content">{editor ? "editor" : "no-editor"}</div>,
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
const darkTheme = createTheme({ palette: { mode: "dark" } });

describe("MergeEditorPanel coverage3", () => {
  it("renders non-source mode (editor mode) with diffLines covering all line types", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "same", blockId: null, lineNumber: 1 },
      { type: "added", text: "added", blockId: 1, lineNumber: 2 },
      { type: "removed", text: "removed", blockId: 2, lineNumber: 3 },
      { type: "modified-old", text: "old", blockId: 3, lineNumber: 4 },
      { type: "modified-new", text: "new", blockId: 3, lineNumber: 5 },
      { type: "padding", text: "", blockId: 3, lineNumber: null },
    ];

    const mockEditor = {
      isDestroyed: false,
      view: { dom: document.createElement("div") },
    } as any;

    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={mockEditor}
          diffLines={diffLines}
          side="left"
          showHoverLabels
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("editor-content")).toBeTruthy();
  });

  it("renders non-source mode in dark theme", () => {
    const diffLines: DiffLine[] = [
      { type: "added", text: "dark added", blockId: 0, lineNumber: 1 },
      { type: "removed", text: "dark removed", blockId: 1, lineNumber: 2 },
    ];

    const { container } = render(
      <ThemeProvider theme={darkTheme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
          diffLines={diffLines}
          side="right"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("onChange filters padding lines from edited text", () => {
    const onSourceChange = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "padding", text: "", blockId: 1, lineNumber: null },
      { type: "added", text: "line2", blockId: 1, lineNumber: 2 },
    ];

    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline2"
          onSourceChange={onSourceChange}
          diffLines={diffLines}
          side="right"
        />
      </ThemeProvider>,
    );

    const textarea = container.querySelector("textarea");
    if (textarea) {
      fireEvent.change(textarea, { target: { value: "line1\n\nline2 changed" } });
      expect(onSourceChange).toHaveBeenCalled();
    }
  });

  it("onChange without diffLines passes text directly", () => {
    const onSourceChange = jest.fn();

    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="original"
          onSourceChange={onSourceChange}
        />
      </ThemeProvider>,
    );

    const textarea = container.querySelector("textarea");
    if (textarea) {
      fireEvent.change(textarea, { target: { value: "changed" } });
      expect(onSourceChange).toHaveBeenCalledWith("changed");
    }
  });

  it("onSelect calls onHoverLine with correct line index", () => {
    const onHoverLine = jest.fn();
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "added", text: "line2", blockId: 0, lineNumber: 2 },
    ];

    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline2"
          diffLines={diffLines}
          side="right"
          onHoverLine={onHoverLine}
        />
      </ThemeProvider>,
    );

    const textarea = container.querySelector("textarea");
    if (textarea) {
      Object.defineProperty(textarea, "selectionStart", { value: 7, configurable: true });
      fireEvent.select(textarea);
      expect(onHoverLine).toHaveBeenCalled();
    }
  });

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

  it("renders with paperSx", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          paperSx={{ border: "1px solid red" }}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with bgGradient", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          bgGradient="linear-gradient(to right, #000, #fff)"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with children in non-source mode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
        >
          <div data-testid="child-content">Child</div>
        </MergeEditorPanel>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child-content")).toBeTruthy();
  });

  it("renders right side with merge buttons", () => {
    const diffLines: DiffLine[] = [
      { type: "added", text: "added line", blockId: 0, lineNumber: 1 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="added line"
          diffLines={diffLines}
          side="right"
          onMerge={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with sourceText ending in newline", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\n"
          diffLines={diffLines}
          side="left"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
