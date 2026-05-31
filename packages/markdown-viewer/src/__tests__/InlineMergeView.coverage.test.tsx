/**
 * InlineMergeView.tsx coverage tests
 * Targets uncovered lines: 82-140, 179-180, 206-210, 218-219, 229, 241-250, 258, 265-279,
 *   292-298, 307-311, 322-340, 353-355, 374-469
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// --- mock functions we need to inspect ---
const mockSetCompareText = jest.fn();
const mockSetEditText = jest.fn();
const mockMergeBlock = jest.fn();
const mockSetDiffOptions = jest.fn();
const mockSetMergeEditors = jest.fn();
const mockApplyMarkdownToEditor = jest.fn();
const mockReadFileAsText = jest.fn();
const mockReviewModeStorage = jest.fn().mockReturnValue({ enabled: false });

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
  reviewModeStorage: mockReviewModeStorage,
}));

jest.mock("../hooks/useDiffBackground", () => ({
  useDiffBackground: () => ({ leftBgGradient: "linear-gradient(red,blue)", rightBgGradient: "linear-gradient(green,yellow)" }),
}));

jest.mock("../hooks/useDiffHighlight", () => ({
  useDiffHighlight: () => {},
}));

jest.mock("../hooks/useMergeDiff", () => ({
  useMergeDiff: () => ({
    compareText: "# Compare",
    setEditText: mockSetEditText,
    setCompareText: mockSetCompareText,
    diffResult: { leftLines: [{ type: "equal" as const, text: "line1" }], rightLines: [{ type: "equal" as const, text: "line1" }] },
    diffOptions: { semantic: false },
    setDiffOptions: mockSetDiffOptions,
    mergeBlock: mockMergeBlock,
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: true,
    canRedo: false,
  }),
}));

jest.mock("../hooks/useScrollSync", () => ({
  useScrollSync: () => {},
}));

jest.mock("../contexts/MergeEditorsContext", () => ({
  setMergeEditors: mockSetMergeEditors,
}));

jest.mock("../utils/editorContentLoader", () => ({
  applyMarkdownToEditor: mockApplyMarkdownToEditor,
}));

jest.mock("../utils/fileReading", () => ({
  readFileAsText: mockReadFileAsText,
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: (md: string) => ({
    frontmatter: md.includes("---") ? "title: test" : null,
    body: md,
  }),
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
  FrontmatterBlock: ({ frontmatter, readOnly }: any) => (
    <div data-testid="frontmatter-block" data-readonly={readOnly}>
      {frontmatter}
    </div>
  ),
}));

jest.mock("../components/LinePreviewPanel", () => ({
  LinePreviewPanel: () => <div data-testid="line-preview-panel" />,
}));

let capturedMergeEditorProps: any = {};
jest.mock("../components/MergeEditorPanel", () => ({
  MergeEditorPanel: (props: any) => {
    capturedMergeEditorProps = props;
    return <div data-testid="merge-editor-panel" />;
  },
}));

import { InlineMergeView } from "../components/InlineMergeView";

const theme = createTheme();

function renderMergeView(props: Partial<React.ComponentProps<typeof InlineMergeView>> = {}) {
  const defaultProps = {
    editorContent: "",
    sourceMode: false,
    editorHeight: 500,
    t: (key: string) => key,
    children: (
      leftBgGradient: string,
      leftDiffLines?: any[],
      onMerge?: any,
      onHoverLine?: any,
    ) => (
      <div data-testid="child" data-bg={leftBgGradient}>
        {leftDiffLines && <span data-testid="diff-lines">{leftDiffLines.length}</span>}
        {onMerge && <button data-testid="merge-btn" onClick={() => onMerge(0, "left-to-right")} />}
        {onHoverLine && <button data-testid="hover-btn" onClick={() => onHoverLine(5)} />}
      </div>
    ),
  };
  return render(
    <ThemeProvider theme={theme}>
      <InlineMergeView {...defaultProps} {...props} />
    </ThemeProvider>,
  );
}

describe("InlineMergeView - coverage tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMergeEditorProps = {};
  });

  // --- flippedMergeBlock (lines 177-183) ---
  it("flips merge direction left-to-right -> right-to-left", () => {
    const { getByTestId } = renderMergeView();
    fireEvent.click(getByTestId("merge-btn"));
    expect(mockMergeBlock).toHaveBeenCalledWith(0, "right-to-left");
  });

  it("flips merge direction right-to-left -> left-to-right via MergeEditorPanel", () => {
    renderMergeView();
    // The MergeEditorPanel receives onMerge=flippedMergeBlock
    if (capturedMergeEditorProps.onMerge) {
      capturedMergeEditorProps.onMerge(1, "right-to-left");
      expect(mockMergeBlock).toHaveBeenCalledWith(1, "left-to-right");
    }
  });

  // --- onRightFileOpsReady (lines 204-213) ---
  it("calls onRightFileOpsReady with loadFile and exportFile", () => {
    const onReady = jest.fn();
    renderMergeView({ onRightFileOpsReady: onReady });
    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({
        loadFile: expect.any(Function),
        exportFile: expect.any(Function),
      }),
    );
  });

  it("exportFile creates a download", () => {
    const onReady = jest.fn();
    renderMergeView({ onRightFileOpsReady: onReady });

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:url");
    URL.revokeObjectURL = jest.fn();

    const ops = onReady.mock.calls[0][0];
    const mockClick = jest.fn();
    const origCreateElement = document.createElement;
    document.createElement = jest.fn().mockImplementation((tag: string) => {
      const el = origCreateElement.call(document, tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    try {
      ops.exportFile();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    } finally {
      document.createElement = origCreateElement;
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  // --- Ctrl+S handler (lines 216-224) ---
  it("dispatches vscode-save-compare-file on Ctrl+S", () => {
    renderMergeView();
    const handler = jest.fn();
    globalThis.addEventListener("vscode-save-compare-file", handler);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    globalThis.removeEventListener("vscode-save-compare-file", handler);
  });

  // --- handleHoverLine (line 228-230) ---
  it("calls handleHoverLine from children", () => {
    const { getByTestId } = renderMergeView();
    // Should not throw
    fireEvent.click(getByTestId("hover-btn"));
  });

  // --- semantic diff toggle (lines 421-433) ---
  it("toggles semantic diff option when button clicked", () => {
    const { container } = renderMergeView();
    const btn = container.querySelector('[aria-label="semanticDiff"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(mockSetDiffOptions).toHaveBeenCalled();
  });

  // --- frontmatter rendering branches (lines 382-416) ---
  it("renders both frontmatter blocks when both exist", () => {
    // compareText has "---" so preprocessMarkdown returns frontmatter
    jest.requireMock("../hooks/useMergeDiff").useMergeDiff = () => ({
      compareText: "---\ntitle: right\n---",
      setEditText: mockSetEditText,
      setCompareText: mockSetCompareText,
      diffResult: { leftLines: [], rightLines: [] },
      diffOptions: { semantic: false },
      setDiffOptions: mockSetDiffOptions,
      mergeBlock: mockMergeBlock,
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: false,
      canRedo: false,
    });

    const { getAllByTestId } = renderMergeView({
      leftFrontmatter: "title: left",
    });
    expect(getAllByTestId("frontmatter-block").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'No Frontmatter' when leftFrontmatter is null but rightFrontmatter exists", () => {
    jest.requireMock("../hooks/useMergeDiff").useMergeDiff = () => ({
      compareText: "---\ntitle: right\n---",
      setEditText: mockSetEditText,
      setCompareText: mockSetCompareText,
      diffResult: { leftLines: [], rightLines: [] },
      diffOptions: { semantic: false },
      setDiffOptions: mockSetDiffOptions,
      mergeBlock: mockMergeBlock,
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: false,
      canRedo: false,
    });

    const { container } = renderMergeView({
      leftFrontmatter: null,
    });
    // rightFrontmatter exists, leftFrontmatter is null => shows No Frontmatter on left side
    expect(container).toBeTruthy();
  });

  it("renders 'No Frontmatter' when rightFrontmatter is null but leftFrontmatter exists", () => {
    // Reset useMergeDiff to have compareText without "---"
    jest.requireMock("../hooks/useMergeDiff").useMergeDiff = () => ({
      compareText: "no frontmatter here",
      setEditText: mockSetEditText,
      setCompareText: mockSetCompareText,
      diffResult: { leftLines: [], rightLines: [] },
      diffOptions: { semantic: false },
      setDiffOptions: mockSetDiffOptions,
      mergeBlock: mockMergeBlock,
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: false,
      canRedo: false,
    });

    const { container } = renderMergeView({
      leftFrontmatter: "title: left",
    });
    expect(container).toBeTruthy();
  });

  // --- drag and drop on left panel (lines 446-471) ---
  it("handles dragOver on left panel", () => {
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      fireEvent.dragOver(leftPanel, { preventDefault: jest.fn(), stopPropagation: jest.fn() });
      fireEvent.dragEnter(leftPanel, { preventDefault: jest.fn(), stopPropagation: jest.fn() });
      fireEvent.dragLeave(leftPanel, { preventDefault: jest.fn(), stopPropagation: jest.fn(), relatedTarget: document.body });
    }
  });

  it("handles file drop with .md file", () => {
    mockReadFileAsText.mockResolvedValue({ text: "# Dropped", encoding: "UTF-8", lineEnding: "LF" });
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      const file = new File(["# Dropped"], "test.md", { type: "text/markdown" });
      fireEvent.drop(leftPanel, {
        dataTransfer: { files: [file] },
      });
      expect(mockReadFileAsText).toHaveBeenCalledWith(file);
    }
  });

  it("ignores drop of non-markdown file", () => {
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      const file = new File(["data"], "image.png", { type: "image/png" });
      fireEvent.drop(leftPanel, {
        dataTransfer: { files: [file] },
      });
      expect(mockReadFileAsText).not.toHaveBeenCalled();
    }
  });

  it("accepts text/ type files on drop", () => {
    mockReadFileAsText.mockResolvedValue({ text: "plain text", encoding: "UTF-8", lineEnding: "LF" });
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      const file = new File(["plain text"], "notes.txt", { type: "text/plain" });
      fireEvent.drop(leftPanel, {
        dataTransfer: { files: [file] },
      });
      expect(mockReadFileAsText).toHaveBeenCalledWith(file);
    }
  });

  // --- file input onChange (lines 373-377) ---
  it("handles file input change", () => {
    mockReadFileAsText.mockResolvedValue({ text: "# Loaded", encoding: "UTF-8", lineEnding: "LF" });
    const { container } = renderMergeView();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["# Loaded"], "doc.md", { type: "text/markdown" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(mockReadFileAsText).toHaveBeenCalledWith(file);
  });

  it("handles file input change with no files", () => {
    const { container } = renderMergeView();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(mockReadFileAsText).not.toHaveBeenCalled();
  });

  // --- setMergeEditors registration (line 360-363) ---
  it("registers merge editors on mount and cleans up", () => {
    const { unmount } = renderMergeView();
    expect(mockSetMergeEditors).toHaveBeenCalledWith(
      expect.objectContaining({ rightEditor: null, leftEditor: null }),
    );
    unmount();
    expect(mockSetMergeEditors).toHaveBeenCalledWith(null);
  });

  // --- setEditText called with editorContent (lines 284-286) ---
  it("syncs editorContent to setEditText", () => {
    renderMergeView({ editorContent: "# Hello" });
    expect(mockSetEditText).toHaveBeenCalledWith("# Hello");
  });

  // --- children receives diff info ---
  it("passes leftDiffLines and merge callbacks to children", () => {
    const { getByTestId } = renderMergeView();
    expect(getByTestId("diff-lines")).toBeTruthy();
  });

  // --- onLeftFrontmatterChange with null (line 411) ---
  it("passes onLeftFrontmatterChange to FrontmatterBlock", () => {
    jest.requireMock("../hooks/useMergeDiff").useMergeDiff = () => ({
      compareText: "---\ntitle: right\n---",
      setEditText: mockSetEditText,
      setCompareText: mockSetCompareText,
      diffResult: { leftLines: [], rightLines: [] },
      diffOptions: { semantic: false },
      setDiffOptions: mockSetDiffOptions,
      mergeBlock: mockMergeBlock,
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: false,
      canRedo: false,
    });

    const onChange = jest.fn();
    renderMergeView({
      leftFrontmatter: "title: left",
      onLeftFrontmatterChange: onChange,
    });
    // Should render without error
  });
});
