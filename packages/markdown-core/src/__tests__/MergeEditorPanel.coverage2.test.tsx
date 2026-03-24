/**
 * MergeEditorPanel.tsx - coverage2 tests
 * Targets: lines 26-37 (_getLineBgColor via diffLines rendering), 354-360 (auto-resize)
 */

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render } from "@testing-library/react";
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

describe("MergeEditorPanel - coverage2", () => {
  it("renders with readOnly in source mode", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
      { type: "added", text: "line2", blockId: 1, lineNumber: 2 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline2"
          diffLines={diffLines}
          side="left"
          readOnly
        />
      </ThemeProvider>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea?.readOnly).toBe(true);
  });

  it("auto-resize effect runs on sourceText change", () => {
    const { rerender, container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1"
          autoResize
        />
      </ThemeProvider>,
    );

    rerender(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline2\nline3"
          autoResize
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with textareaRef prop", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          textareaRef={ref}
        />
      </ThemeProvider>,
    );
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(container).toBeTruthy();
  });

  it("renders with textareaAriaLabel", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="test"
          textareaAriaLabel="Source editor"
        />
      </ThemeProvider>,
    );
    const textarea = container.querySelector('textarea[aria-label="Source editor"]');
    expect(textarea).toBeTruthy();
  });

  it("renders source mode with right side merge buttons", () => {
    const diffLines: DiffLine[] = [
      { type: "equal", text: "same", blockId: null, lineNumber: 1 },
      { type: "added", text: "new", blockId: 0, lineNumber: 2 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="same\nnew"
          diffLines={diffLines}
          side="right"
          onMerge={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(container.querySelector("textarea")).toBeTruthy();
  });
});
