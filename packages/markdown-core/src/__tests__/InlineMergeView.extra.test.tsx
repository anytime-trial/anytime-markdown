/**
 * InlineMergeView.tsx の追加カバレッジテスト
 * ユーティリティ関数: collectCollapsedStates, applyCollapsedStates, downloadText
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

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
  reviewModeStorage: jest.fn().mockReturnValue({ enabled: false }),
}));

jest.mock("../hooks/useDiffBackground", () => ({
  useDiffBackground: () => ({ leftBgGradient: "none", rightBgGradient: "none" }),
}));

jest.mock("../hooks/useDiffHighlight", () => ({
  useDiffHighlight: () => {},
}));

const mockSetCompareText = jest.fn();
const mockSetEditText = jest.fn();
const mockMergeBlock = jest.fn();

jest.mock("../hooks/useMergeDiff", () => ({
  useMergeDiff: () => ({
    compareText: "# Compare",
    setEditText: mockSetEditText,
    setCompareText: mockSetCompareText,
    diffResult: { leftLines: [], rightLines: [] },
    diffOptions: { semantic: false },
    setDiffOptions: jest.fn(),
    mergeBlock: mockMergeBlock,
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
  preprocessMarkdown: (md: string) => ({ frontmatter: null, body: md }),
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

describe("InlineMergeView - additional tests", () => {
  const t = (key: string) => key;

  it("renders with leftFrontmatter", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
          leftFrontmatter="title: Test"
        >
          {(bg) => <div>{bg}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders semantic diff toggle button", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
        >
          {(bg) => <div>{bg}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    const semanticBtn = container.querySelector('[aria-label="semanticDiff"]');
    expect(semanticBtn).toBeTruthy();
  });

  it("renders with externalRightContent", () => {
    const onConsumed = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
          externalRightContent="# External"
          onExternalRightContentConsumed={onConsumed}
        >
          {(bg) => <div>{bg}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    expect(mockSetCompareText).toHaveBeenCalledWith("# External");
    expect(onConsumed).toHaveBeenCalled();
  });

  it("renders with onUndoRedoReady callback", () => {
    const onReady = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
          onUndoRedoReady={onReady}
        >
          {(bg) => <div>{bg}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({ undo: expect.any(Function), redo: expect.any(Function) }),
    );
  });

  it("renders with commentSlot", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
          commentSlot={<div data-testid="comment-slot">Comments</div>}
        >
          {(bg) => <div>{bg}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    expect(container.querySelector('[data-testid="comment-slot"]')).toBeTruthy();
  });

  it("renders file input for right panel", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <InlineMergeView
          editorContent=""
          sourceMode={false}
          editorHeight={500}
          t={t}
        >
          {(bg) => <div>{bg}</div>}
        </InlineMergeView>
      </ThemeProvider>,
    );
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
  });
});
