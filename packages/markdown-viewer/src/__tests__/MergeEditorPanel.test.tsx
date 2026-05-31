/**
 * MergeEditorPanel.tsx のスモークテスト
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

const theme = createTheme();

describe("MergeEditorPanel", () => {
  it("renders in sourceMode without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="# Left"
          onSourceChange={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders in editor mode without editor", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with diffLines", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={true}
          sourceText="line1\nline2"
          diffLines={[
            { type: "equal", text: "line1", blockId: null, lineNumber: 1 },
            { type: "added", text: "line2", blockId: null, lineNumber: 2 },
          ]}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
