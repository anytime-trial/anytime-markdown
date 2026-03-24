/**
 * MergeEditorPanel.tsx の追加カバレッジテスト
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

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@tiptap/react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock("../constants/colors", () => ({
  getEditorBg: () => "#fff",
  getDivider: () => "#ccc",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
  getTextDisabled: () => "#999",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getErrorMain: () => "#f00",
  getSuccessMain: () => "#0f0",
  getGrey: () => "#888",
  getBgPaper: () => "#fff",
  getActionSelected: () => "rgba(0,0,0,0.08)",
  getPrimaryMain: () => "#1976d2",
}));

jest.mock("../constants/dimensions", () => ({
  MERGE_LINE_NUMBER_FONT_SIZE: 11,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "sans-serif",
  }),
}));

jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: React.forwardRef((props: any, ref: any) => (
    <textarea ref={ref} data-testid="line-number-textarea" value={props.value} onChange={() => {}} />
  )),
}));

import { MergeEditorPanel } from "../components/MergeEditorPanel";

const theme = createTheme();

describe("MergeEditorPanel - additional tests", () => {
  it("renders in source mode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="# Source"
          onSourceChange={jest.fn()}
          side="left"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders in WYSIWYG mode with editor", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          sourceText=""
          onSourceChange={jest.fn()}
          editor={null}
          side="right"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with readOnly", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="# Read Only"
          onSourceChange={jest.fn()}
          readOnly
          side="left"
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
          sourceText="# Gradient"
          onSourceChange={jest.fn()}
          bgGradient="linear-gradient(red, blue)"
          side="left"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with diffLines", () => {
    const diffLines = [
      { type: "equal" as const, text: "line1", blockId: null, lineNumber: 1 },
      { type: "added" as const, text: "new line", blockId: null, lineNumber: 2 },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nnew line"
          onSourceChange={jest.fn()}
          diffLines={diffLines}
          side="right"
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
