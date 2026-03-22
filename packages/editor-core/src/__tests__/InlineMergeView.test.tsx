/**
 * InlineMergeView.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// --- mocks ---

jest.mock("@tiptap/react", () => ({
  useEditor: () => null,
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

jest.mock("../editorExtensions", () => ({
  getBaseExtensions: () => [],
}));

jest.mock("../extensions/customHardBreak", () => ({
  CustomHardBreak: {},
}));

jest.mock("../extensions/reviewModeExtension", () => ({
  ReviewModeExtension: { name: "reviewMode" },
  reviewModeStorage: {},
}));

jest.mock("../hooks/useDiffBackground", () => ({
  useDiffBackground: () => "none",
}));

jest.mock("../hooks/useDiffHighlight", () => ({
  useDiffHighlight: () => {},
}));

jest.mock("../hooks/useMergeDiff", () => ({
  useMergeDiff: () => ({
    compareText: "",
    setEditText: jest.fn(),
    setCompareText: jest.fn(),
    diffResult: { leftLines: [], rightLines: [] },
    diffOptions: { semantic: false },
    setDiffOptions: jest.fn(),
    mergeBlock: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

jest.mock("../hooks/useScrollSync", () => ({
  useScrollSync: () => ({
    leftRef: { current: null },
    rightRef: { current: null },
  }),
}));

jest.mock("../contexts/MergeEditorsContext", () => ({
  setMergeEditors: jest.fn(),
}));

jest.mock("../utils/editorContentLoader", () => ({
  applyMarkdownToEditor: jest.fn(),
}));

jest.mock("../utils/fileReading", () => ({
  readFileAsText: jest.fn(),
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: (md: string) => md,
}));

jest.mock("../constants/colors", () => ({
  FILE_DROP_OVERLAY_COLOR: "rgba(0,0,0,0.1)",
  getDivider: () => "#ccc",
  getEditorBg: () => "#fff",
  getTextDisabled: () => "#999",
}));

jest.mock("../constants/dimensions", () => ({
  MERGE_INFO_FONT_SIZE: 12,
}));

jest.mock("../components/FrontmatterBlock", () => ({
  FrontmatterBlock: () => <div data-testid="frontmatter-block" />,
}));

jest.mock("../components/LinePreviewPanel", () => ({
  LinePreviewPanel: () => <div data-testid="line-preview-panel" />,
}));

jest.mock("../components/MergeEditorPanel", () => ({
  MergeEditorPanel: () => <div data-testid="merge-editor-panel" />,
}));

import { InlineMergeView } from "../components/InlineMergeView";

const theme = createTheme();

describe("InlineMergeView", () => {
  const t = (key: string) => key;

  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
        >
          {(leftBgGradient) => <div data-testid="child">{leftBgGradient}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with sourceMode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent="# Test"
          sourceMode={true}
          editorHeight={400}
          t={t}
        >
          {(leftBgGradient) => <div>{leftBgGradient}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
