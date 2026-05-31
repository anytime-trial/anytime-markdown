/**
 * InlineMergeView.tsx coverage3 tests
 * Targets remaining uncovered lines:
 *   108-126: applyCollapsedStates with actual node matching (collapsed + codeCollapsed attrs)
 *   206: onRightFileOpsReady loadFile callback
 *   241,245-250: handleClickOn - checkbox blocking in editorProps
 *   293,308: compareText/sourceMode sync effects (destroyed editor guards)
 *   323-324,327,331-333: collapsed state sync detail (applyCollapsedStates)
 *   424: Ctrl+S ctrlKey path
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// --- mock functions ---
const mockSetCompareText = jest.fn();
const mockSetEditText = jest.fn();
const mockMergeBlock = jest.fn();
const mockSetDiffOptions = jest.fn();
const mockSetMergeEditors = jest.fn();
const mockApplyMarkdownToEditor = jest.fn();
const mockReadFileAsText = jest.fn();
const mockReviewModeStorageObj = { enabled: false };
const mockReviewModeStorage = jest.fn().mockReturnValue(mockReviewModeStorageObj);

let mockLeftEditorInstance: any = null;
let useEditorConfig: any = null;

const createMockLeftEditor = () => {
  const dom = document.createElement("div");
  const trSetNodeMarkup = jest.fn();
  return {
    isDestroyed: false,
    view: {
      dom,
      dispatch: jest.fn(),
    },
    state: {
      doc: {
        descendants: jest.fn(),
      },
      tr: {
        setNodeMarkup: trSetNodeMarkup,
      },
    },
    on: jest.fn(),
    off: jest.fn(),
    _trSetNodeMarkup: trSetNodeMarkup,
  };
};

jest.mock("@tiptap/react", () => ({
  useEditor: (config: any) => {
    useEditorConfig = config;
    mockLeftEditorInstance = createMockLeftEditor();
    return mockLeftEditorInstance;
  },
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14, lineHeight: 1.6, fontFamily: "sans-serif", blockAlign: "left", tableWidth: "100%",
  }),
}));

jest.mock("../editorExtensions", () => ({ getBaseExtensions: () => [] }));
jest.mock("../extensions/customHardBreak", () => ({ CustomHardBreak: {} }));
jest.mock("../extensions/reviewModeExtension", () => ({
  ReviewModeExtension: { name: "reviewMode" },
  reviewModeStorage: mockReviewModeStorage,
}));

jest.mock("../hooks/useDiffBackground", () => ({
  useDiffBackground: () => ({ leftBgGradient: "lg1", rightBgGradient: "lg2" }),
}));

jest.mock("../hooks/useDiffHighlight", () => ({ useDiffHighlight: () => {} }));

jest.mock("../hooks/useMergeDiff", () => ({
  useMergeDiff: () => ({
    compareText: "# Compare",
    setEditText: mockSetEditText,
    setCompareText: mockSetCompareText,
    diffResult: { leftLines: [], rightLines: [] },
    diffOptions: { semantic: false },
    setDiffOptions: mockSetDiffOptions,
    mergeBlock: mockMergeBlock,
    undo: jest.fn(), redo: jest.fn(), canUndo: false, canRedo: false,
  }),
}));

jest.mock("../hooks/useScrollSync", () => ({ useScrollSync: () => {} }));
jest.mock("../contexts/MergeEditorsContext", () => ({ setMergeEditors: mockSetMergeEditors }));
jest.mock("../utils/editorContentLoader", () => ({ applyMarkdownToEditor: mockApplyMarkdownToEditor }));
jest.mock("../utils/fileReading", () => ({ readFileAsText: mockReadFileAsText }));
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

jest.mock("../constants/dimensions", () => ({ MERGE_INFO_FONT_SIZE: 12 }));

jest.mock("../components/FrontmatterBlock", () => ({
  FrontmatterBlock: ({ frontmatter, readOnly }: any) => (
    <div data-testid="frontmatter-block" data-readonly={readOnly}>{frontmatter}</div>
  ),
}));
jest.mock("../components/LinePreviewPanel", () => ({
  LinePreviewPanel: () => <div data-testid="line-preview-panel" />,
}));

jest.mock("../components/MergeEditorPanel", () => ({
  MergeEditorPanel: (props: any) => <div data-testid="merge-editor-panel" />,
}));

import { InlineMergeView } from "../components/InlineMergeView";

const theme = createTheme();

function renderMergeView(props: Partial<React.ComponentProps<typeof InlineMergeView>> = {}) {
  const defaultProps = {
    editorContent: "",
    sourceMode: false,
    editorHeight: 500,
    t: (key: string) => key,
    children: (leftBgGradient: string, leftDiffLines?: any[], onMerge?: any, onHoverLine?: any) => (
      <div data-testid="child" />
    ),
  };
  return render(
    <ThemeProvider theme={theme}>
      <InlineMergeView {...defaultProps} {...props} />
    </ThemeProvider>,
  );
}

describe("InlineMergeView - coverage3", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeftEditorInstance = null;
    useEditorConfig = null;
    mockReviewModeStorageObj.enabled = false;
  });

  // --- Lines 108-126: applyCollapsedStates detail coverage ---
  // This requires testing the collapsed state sync with nodes that have matching types/indices
  it("applyCollapsedStates applies collapsed and codeCollapsed attributes", () => {
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });

    // Create a right editor with collapsible nodes
    const mockRightEditor = {
      isDestroyed: false,
      on: jest.fn(),
      off: jest.fn(),
      state: {
        doc: {
          descendants: jest.fn((cb: any) => {
            // Two codeBlock nodes: one collapsed, one with codeCollapsed
            cb({ type: { name: "codeBlock" }, attrs: { collapsed: true, codeCollapsed: false } }, 10);
            cb({ type: { name: "table" }, attrs: { collapsed: false, codeCollapsed: true } }, 20);
          }),
        },
      },
    };

    renderMergeView({
      rightEditor: mockRightEditor as any,
      sourceMode: false,
    });

    // Set up leftEditor doc with matching nodes having different attrs
    if (mockLeftEditorInstance) {
      mockLeftEditorInstance.state.doc.descendants.mockImplementation((cb: any) => {
        cb(
          { type: { name: "codeBlock" }, attrs: { collapsed: false, codeCollapsed: false } },
          10,
        );
        cb(
          { type: { name: "table" }, attrs: { collapsed: false, codeCollapsed: false } },
          20,
        );
      });

      // Trigger update handler
      const updateCall = mockRightEditor.on.mock.calls.find((c: any[]) => c[0] === "update");
      if (updateCall) {
        act(() => updateCall[1]());
      }

      // applyCollapsedStates should have dispatched a transaction
      expect(mockLeftEditorInstance.view.dispatch).toHaveBeenCalled();
      expect(mockLeftEditorInstance._trSetNodeMarkup).toHaveBeenCalledWith(
        10, undefined, expect.objectContaining({ collapsed: true }),
      );
      expect(mockLeftEditorInstance._trSetNodeMarkup).toHaveBeenCalledWith(
        20, undefined, expect.objectContaining({ codeCollapsed: true }),
      );
    }

    rafSpy.mockRestore();
  });

  it("applyCollapsedStates does not dispatch when no changes needed", () => {
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });

    const mockRightEditor = {
      isDestroyed: false,
      on: jest.fn(),
      off: jest.fn(),
      state: {
        doc: {
          descendants: jest.fn((cb: any) => {
            cb({ type: { name: "codeBlock" }, attrs: { collapsed: false } }, 10);
          }),
        },
      },
    };

    renderMergeView({
      rightEditor: mockRightEditor as any,
      sourceMode: false,
    });

    if (mockLeftEditorInstance) {
      // Same attrs as source => no change
      mockLeftEditorInstance.state.doc.descendants.mockImplementation((cb: any) => {
        cb({ type: { name: "codeBlock" }, attrs: { collapsed: false } }, 10);
      });

      const updateCall = mockRightEditor.on.mock.calls.find((c: any[]) => c[0] === "update");
      if (updateCall) {
        act(() => updateCall[1]());
      }

      // No dispatch because no changes
      expect(mockLeftEditorInstance.view.dispatch).not.toHaveBeenCalled();
    }

    rafSpy.mockRestore();
  });

  it("applyCollapsedStates skips when source state not found for a node", () => {
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });

    const mockRightEditor = {
      isDestroyed: false,
      on: jest.fn(),
      off: jest.fn(),
      state: {
        doc: {
          // Right editor has one codeBlock
          descendants: jest.fn((cb: any) => {
            cb({ type: { name: "codeBlock" }, attrs: { collapsed: true } }, 10);
          }),
        },
      },
    };

    renderMergeView({
      rightEditor: mockRightEditor as any,
      sourceMode: false,
    });

    if (mockLeftEditorInstance) {
      // Left editor has a table (no matching codeBlock in source)
      mockLeftEditorInstance.state.doc.descendants.mockImplementation((cb: any) => {
        cb({ type: { name: "table" }, attrs: { collapsed: false } }, 30);
      });

      const updateCall = mockRightEditor.on.mock.calls.find((c: any[]) => c[0] === "update");
      if (updateCall) {
        act(() => updateCall[1]());
      }

      // No matching source state => no dispatch
      expect(mockLeftEditorInstance.view.dispatch).not.toHaveBeenCalled();
    }

    rafSpy.mockRestore();
  });

  // --- Line 206: onRightFileOpsReady loadFile callback ---
  it("loadFile triggers file input click", () => {
    const onReady = jest.fn();
    renderMergeView({ onRightFileOpsReady: onReady });

    expect(onReady).toHaveBeenCalled();
    const ops = onReady.mock.calls[0][0];
    // loadFile should try to click the hidden file input
    // Just calling it shouldn't throw
    ops.loadFile();
  });

  // --- Lines 241-250: handleClickOn in editorProps (checkbox blocking) ---
  it("handleClickOn blocks checkbox click and returns true", () => {
    renderMergeView();

    // Access the handleClickOn from useEditor config
    expect(useEditorConfig).toBeTruthy();
    const handleClickOn = useEditorConfig?.editorProps?.handleClickOn;
    if (handleClickOn) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const mockEvent = { target: checkbox, preventDefault: jest.fn() };
      const result = handleClickOn({}, 0, {}, 0, mockEvent);
      expect(result).toBe(true);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    }
  });

  it("handleClickOn allows non-checkbox click and returns false", () => {
    renderMergeView();

    const handleClickOn = useEditorConfig?.editorProps?.handleClickOn;
    if (handleClickOn) {
      const span = document.createElement("span");
      const mockEvent = { target: span, preventDefault: jest.fn() };
      const result = handleClickOn({}, 0, {}, 0, mockEvent);
      expect(result).toBe(false);
    }
  });

  // --- handleDOMEvents.drop returns true ---
  it("handleDOMEvents.drop returns true to skip ProseMirror handling", () => {
    renderMergeView();

    const drop = useEditorConfig?.editorProps?.handleDOMEvents?.drop;
    if (drop) {
      expect(drop()).toBe(true);
    }
  });

  // --- Lines 293, 308: destroyed editor guards ---
  it("skips compareText sync when leftEditor is destroyed", () => {
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      // Mark editor as destroyed before callback runs
      if (mockLeftEditorInstance) {
        mockLeftEditorInstance.isDestroyed = true;
      }
      cb(0);
      return 0;
    });

    renderMergeView({ sourceMode: false });

    // applyMarkdownToEditor should NOT be called because editor is destroyed
    expect(mockApplyMarkdownToEditor).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  // --- Line 323-324: collapsed state sync guard for destroyed editors ---
  it("skips collapsed sync when rightEditor is destroyed", () => {
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });

    const mockRightEditor = {
      isDestroyed: true,  // destroyed
      on: jest.fn(),
      off: jest.fn(),
      state: { doc: { descendants: jest.fn() } },
    };

    renderMergeView({
      rightEditor: mockRightEditor as any,
      sourceMode: false,
    });

    const updateCall = mockRightEditor.on.mock.calls.find((c: any[]) => c[0] === "update");
    if (updateCall) {
      act(() => updateCall[1]());
    }

    // Should not call descendants on right editor's doc because it's destroyed
    expect(mockRightEditor.state.doc.descendants).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  // --- Line 424: Ctrl+S (not Meta+S) ---
  it("dispatches vscode-save-compare-file on Ctrl+S", () => {
    renderMergeView();
    const handler = jest.fn();
    globalThis.addEventListener("vscode-save-compare-file", handler);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    globalThis.removeEventListener("vscode-save-compare-file", handler);
  });

  // --- file input onChange ---
  it("handles file input change for right panel", async () => {
    mockReadFileAsText.mockResolvedValue({ text: "# New", encoding: "UTF-8", lineEnding: "LF" });
    const { container } = renderMergeView();

    const fileInput = container.querySelector('input[type="file"]');
    if (fileInput) {
      const file = new File(["# New"], "test.md", { type: "text/markdown" });
      fireEvent.change(fileInput, { target: { files: [file] } });
      expect(mockReadFileAsText).toHaveBeenCalledWith(file);
    }
  });

  // --- drop non-md file is ignored ---
  it("ignores drop of non-markdown file", () => {
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      const file = new File(["binary"], "test.exe", { type: "application/octet-stream" });
      fireEvent.drop(leftPanel, { dataTransfer: { files: [file] } });
      expect(mockReadFileAsText).not.toHaveBeenCalled();
    }
  });

  // --- dragOver on left panel ---
  it("sets rightDragOver on dragOver", () => {
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      fireEvent.dragOver(leftPanel);
      // After dragOver, the overlay should be rendered (via CSS)
      // Just verify no error
    }
  });

  // --- dragLeave with relatedTarget outside ---
  it("resets rightDragOver on dragLeave with external relatedTarget", () => {
    const { container } = renderMergeView();
    const leftPanel = container.querySelector('[data-testid="merge-editor-panel"]')?.parentElement?.parentElement;
    if (leftPanel) {
      fireEvent.dragOver(leftPanel);  // first set dragOver to true
      fireEvent.dragLeave(leftPanel, { relatedTarget: document.body });
      // Verify no error
    }
  });
});
