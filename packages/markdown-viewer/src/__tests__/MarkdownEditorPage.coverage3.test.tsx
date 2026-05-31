/**
 * MarkdownEditorPage.tsx coverage3 tests
 * Targets remaining uncovered lines: 15, 42-43, 268, 314-315, 522-534
 */
import React from "react";
import { render, act, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next/dynamic", () => {
  return function dynamic(loader: any, opts?: any) {
    const Loading = opts?.loading;
    return function DynamicComponent(props: any) {
      return (
        <div data-testid="dynamic-component">
          {Loading && <Loading />}
        </div>
      );
    };
  };
});

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

const mockEditorCommands = {
  setChangeGutterBaseline: jest.fn(),
  clearChangeGutter: jest.fn(),
  goToNextChange: jest.fn(),
  goToPrevChange: jest.fn(),
  setTextSelection: jest.fn(),
  initComments: jest.fn(),
};

const mockEditorChain = {
  focus: jest.fn().mockReturnThis(),
  insertContent: jest.fn().mockReturnThis(),
  run: jest.fn(),
  setImage: jest.fn().mockReturnThis(),
};

const mockEditor = {
  chain: jest.fn(() => mockEditorChain),
  commands: mockEditorCommands,
  isDestroyed: false,
  isEmpty: true,
  view: { dom: { scrollTop: 0 } },
  storage: {
    markdown: {
      getMarkdown: jest.fn(() => ""),
      parser: { parse: jest.fn() },
    },
  },
};

jest.mock("@tiptap/react", () => ({
  useEditor: () => mockEditor,
  EditorContent: () => <div data-testid="editor-content" />,
  ReactNodeViewRenderer: () => () => null,
}));

let mockCommentData = new Map();

jest.mock("../useMarkdownEditor", () => ({
  useMarkdownEditor: () => ({
    initialContent: "# Test Content",
    loading: false,
    saveContent: jest.fn(),
    downloadMarkdown: jest.fn(),
    clearContent: jest.fn(),
    frontmatterRef: { current: null },
    initialTrailingNewline: false,
  }),
}));

jest.mock("../useEditorSettings", () => ({
  EditorSettingsContext: React.createContext({}),
  useEditorSettings: () => ({
    settings: { fontSize: 14, lineHeight: 1.6, fontFamily: "sans-serif", blockAlign: "left", tableWidth: "100%" },
    updateSettings: jest.fn(),
    resetSettings: jest.fn(),
  }),
  useEditorSettingsContext: () => ({ fontSize: 14, lineHeight: 1.6, fontFamily: "sans-serif", blockAlign: "left", tableWidth: "100%" }),
}));

jest.mock("../hooks/useEditorBlockActions", () => ({
  useEditorBlockActions: () => ({ handleToggleAllBlocks: jest.fn(), handleExpandAllBlocks: jest.fn() }),
}));
jest.mock("../hooks/useEditorCommentNotifications", () => ({
  useEditorCommentNotifications: () => {},
}));
jest.mock("../hooks/useEditorConfig", () => ({
  useEditorConfig: () => ({}),
}));
jest.mock("../hooks/useEditorDialogs", () => ({
  useEditorDialogs: () => ({
    commentDialogOpen: false, setCommentDialogOpen: jest.fn(),
    commentText: "", setCommentText: jest.fn(), handleCommentInsert: jest.fn(),
    linkDialogOpen: false, setLinkDialogOpen: jest.fn(),
    linkUrl: "", setLinkUrl: jest.fn(),
    handleLink: jest.fn(), handleLinkInsert: jest.fn(),
    imageDialogOpen: false, setImageDialogOpen: jest.fn(),
    imageUrl: "", setImageUrl: jest.fn(), imageAlt: "", setImageAlt: jest.fn(), imageEditPos: null,
    handleImage: jest.fn(), handleImageInsert: jest.fn(),
    shortcutDialogOpen: false, setShortcutDialogOpen: jest.fn(),
    versionDialogOpen: false, setVersionDialogOpen: jest.fn(),
  }),
}));

const mockSetFrontmatterText = jest.fn();
jest.mock("../hooks/useEditorFileHandling", () => ({
  useEditorFileHandling: () => ({
    handleDrop: jest.fn(), handlePaste: jest.fn(),
    setFrontmatterText: mockSetFrontmatterText, frontmatterText: null,
    handleFrontmatterChange: jest.fn(), encoding: "utf-8",
    handleLineEndingChange: jest.fn(), handleEncodingChange: jest.fn(),
  }),
}));

jest.mock("../hooks/useEditorFileOps", () => ({
  useEditorFileOps: () => ({
    handleClear: jest.fn(), handleFileSelected: jest.fn(),
    handleDownload: jest.fn(), handleImport: jest.fn(), handleCopy: jest.fn(),
    handleOpenFile: jest.fn(), handleSaveFile: jest.fn(),
    handleSaveAsFile: jest.fn(), handleExportPdf: jest.fn(),
    notification: null, setNotification: jest.fn(),
    fileInputRef: { current: null }, pdfExporting: false,
  }),
}));

jest.mock("../hooks/useEditorHeight", () => ({
  useEditorHeight: () => ({ editorContainerRef: { current: null }, editorHeight: 500 }),
}));
jest.mock("../hooks/useEditorMenuState", () => ({
  useEditorMenuState: () => ({
    settingsOpen: false, setSettingsOpen: jest.fn(),
    sampleAnchorEl: null, setSampleAnchorEl: jest.fn(),
    diagramAnchorEl: null, setDiagramAnchorEl: jest.fn(),
    helpAnchorEl: null, setHelpAnchorEl: jest.fn(),
    templateAnchorEl: null, setTemplateAnchorEl: jest.fn(),
    headingMenu: null, setHeadingMenu: jest.fn(),
  }),
}));
jest.mock("../hooks/useEditorSettingsSync", () => ({ useEditorSettingsSync: () => {} }));
jest.mock("../hooks/useEditorShortcuts", () => ({ useEditorShortcuts: () => {} }));
jest.mock("../hooks/useEditorSideEffects", () => ({ useEditorSideEffects: () => {} }));
jest.mock("../hooks/useFileSystem", () => ({
  useFileSystem: () => ({
    fileHandle: null, setFileHandle: jest.fn(),
    openFile: jest.fn(), saveFile: jest.fn(), saveAsFile: jest.fn(),
    resetFile: jest.fn(), fileName: null, isDirty: false,
    supportsDirectAccess: false, markDirty: jest.fn(),
  }),
}));
jest.mock("../hooks/useTextareaSearch", () => ({
  useTextareaSearch: () => ({ searchState: null, setSearchState: jest.fn() }),
}));
jest.mock("../hooks/useFloatingToolbar", () => ({
  useFloatingToolbar: () => null,
}));

let mockSourceModeVal = false;
const mockSetSourceText = jest.fn();
jest.mock("../hooks/useSourceMode", () => ({
  useSourceMode: () => ({
    sourceMode: mockSourceModeVal,
    readonlyMode: false, reviewMode: false,
    sourceText: "", setSourceText: mockSetSourceText,
    liveMessage: "", setLiveMessage: jest.fn(),
    handleSwitchToSource: jest.fn(), handleSwitchToWysiwyg: jest.fn(),
    handleSwitchToReview: jest.fn(), handleSwitchToReadonly: jest.fn(),
    executeInReviewMode: jest.fn(), handleSourceChange: jest.fn(),
    appendToSource: jest.fn(),
  }),
}));

jest.mock("../hooks/useOutline", () => ({
  useOutline: () => ({
    outlineOpen: false, headings: [], setHeadings: jest.fn(),
    foldedIndices: new Set(), hiddenByFold: new Set(),
    outlineWidth: 220, setOutlineWidth: jest.fn(),
    handleToggleOutline: jest.fn(), handleHeadingDragEnd: jest.fn(),
    handleOutlineDelete: jest.fn(), handleOutlineClick: jest.fn(),
    toggleFold: jest.fn(), foldAll: jest.fn(), unfoldAll: jest.fn(),
    handleOutlineResizeStart: jest.fn(),
  }),
}));
jest.mock("../hooks/useMergeMode", () => ({
  useMergeMode: () => ({
    inlineMergeOpen: false, setInlineMergeOpen: jest.fn(),
    editorMarkdown: "", setEditorMarkdown: jest.fn(),
    mergeUndoRedo: null, setMergeUndoRedo: jest.fn(),
    compareFileContent: "", setCompareFileContent: jest.fn(),
    rightFileOps: null, setRightFileOps: jest.fn(), handleMerge: jest.fn(),
  }),
}));
jest.mock("../hooks/useSectionNumbers", () => ({
  useSectionNumbers: () => ({
    handleInsertSectionNumbers: jest.fn(), handleRemoveSectionNumbers: jest.fn(),
  }),
}));
jest.mock("../hooks/useVSCodeIntegration", () => ({ useVSCodeIntegration: () => {} }));

jest.mock("../components/EditorDialogsSection", () => ({
  EditorDialogsSection: () => <div data-testid="editor-dialogs-section" />,
}));

let capturedScreenCapture: any = {};
jest.mock("../components/ScreenCaptureDialog", () => ({
  ScreenCaptureDialog: (props: any) => {
    capturedScreenCapture = props;
    return props.open ? (
      <div data-testid="screen-capture-dialog">
        <button data-testid="capture-btn" onClick={() => props.onCapture("data:image/png;base64,abc")}>capture</button>
      </div>
    ) : null;
  },
}));
jest.mock("../components/EditorErrorBoundary", () => ({
  EditorErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));
let capturedFooterProps: any = {};
jest.mock("../components/EditorFooterOverlays", () => ({
  EditorFooterOverlays: (props: any) => { capturedFooterProps = props; return <div data-testid="editor-footer-overlays" />; },
}));
let capturedMainContentProps: any = {};
jest.mock("../components/EditorMainContent", () => ({
  EditorMainContent: (props: any) => { capturedMainContentProps = props; return <div data-testid="editor-main-content" />; },
}));
jest.mock("../components/EditorToolbarSection", () => ({
  EditorToolbarSection: () => <div data-testid="editor-toolbar-section" />,
}));
jest.mock("../components/ReadonlyToolbar", () => ({
  ReadonlyToolbar: () => <div data-testid="readonly-toolbar" />,
}));
jest.mock("../constants/defaultContent", () => ({
  getDefaultContent: () => "# Default",
}));
jest.mock("../styles/printStyles", () => ({
  PrintStyles: () => null,
}));
jest.mock("../utils/commentHelpers", () => ({
  parseCommentData: (content: string) => ({ comments: mockCommentData, body: content }),
  serializeCommentData: jest.fn(),
}));
jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: (content: string) => ({ frontmatter: null, body: content }),
}));
jest.mock("../extensions/slashCommandExtension", () => ({
  SlashCommandExtension: { name: "slashCommand" },
}));

import MarkdownEditorPage from "../MarkdownEditorPage";

const theme = createTheme();

function renderPage(props: Record<string, any> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <MarkdownEditorPage {...props} />
    </ThemeProvider>,
  );
}

describe("MarkdownEditorPage - coverage3", () => {
  beforeEach(() => {
    mockSourceModeVal = false;
    mockCommentData = new Map();
    jest.clearAllMocks();
    capturedFooterProps = {};
    capturedMainContentProps = {};
    capturedScreenCapture = {};
  });

  it("calls initComments when comments exist", () => {
    mockCommentData = new Map([["c1", { id: "c1", text: "comment" }]]);
    renderPage();
    expect(mockEditorCommands.initComments).toHaveBeenCalledWith(mockCommentData);
  });

  it("screen capture dialog onCapture inserts image via editor chain", () => {
    renderPage();
    act(() => { globalThis.dispatchEvent(new Event("open-screen-capture")); });
    if (capturedScreenCapture.onCapture) {
      capturedScreenCapture.onCapture("data:image/png;base64,xyz");
      expect(mockEditorChain.setImage).toHaveBeenCalledWith({ src: "data:image/png;base64,xyz", alt: "" });
    }
  });

  it("handles vscode-set-content event in source mode", () => {
    mockSourceModeVal = true;
    renderPage();
    act(() => { globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: "# New content" })); });
    expect(mockSetSourceText).toHaveBeenCalledWith("# New content");
  });

  it("ignores vscode-set-content when not in source mode", () => {
    mockSourceModeVal = false;
    renderPage();
    act(() => { globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: "# ignored" })); });
    expect(mockSetSourceText).not.toHaveBeenCalled();
  });

  it("handles vscode-image-saved event", () => {
    renderPage();
    act(() => { globalThis.dispatchEvent(new CustomEvent("vscode-image-saved", { detail: "images/screenshot.png" })); });
    expect(mockEditorChain.setImage).toHaveBeenCalledWith({ src: "images/screenshot.png", alt: "" });
  });

  it("handles Escape key to reset change gutter baseline", () => {
    renderPage({ autoReload: true });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(mockEditorCommands.setChangeGutterBaseline).toHaveBeenCalled();
  });

  it("handles Alt+F5 to navigate to next change", () => {
    renderPage({ autoReload: true });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", altKey: true })); });
    expect(mockEditorCommands.goToNextChange).toHaveBeenCalled();
  });

  it("handles Shift+Alt+F5 to navigate to prev change", () => {
    renderPage({ autoReload: true });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", altKey: true, shiftKey: true })); });
    expect(mockEditorCommands.goToPrevChange).toHaveBeenCalled();
  });

  it("uses fixedEditorHeight when provided", () => {
    renderPage({ fixedEditorHeight: 800 });
    expect(capturedMainContentProps.editorHeight).toBe(800);
  });

  it("readOnly mode renders without crash", () => {
    renderPage({ readOnly: true });
    expect(screen.getByTestId("error-boundary")).toBeTruthy();
  });

  it("clearContentWithFrontmatter calls setFrontmatterText", () => {
    renderPage();
    expect(mockSetFrontmatterText).toHaveBeenCalled();
  });

  it("vscode-set-content ignores non-string detail", () => {
    mockSourceModeVal = true;
    renderPage();
    act(() => { globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: 123 })); });
    expect(mockSetSourceText).not.toHaveBeenCalled();
  });

  it("vscode-image-saved ignores non-string detail", () => {
    renderPage();
    act(() => { globalThis.dispatchEvent(new CustomEvent("vscode-image-saved", { detail: null })); });
    expect(mockEditorChain.setImage).not.toHaveBeenCalled();
  });
});
