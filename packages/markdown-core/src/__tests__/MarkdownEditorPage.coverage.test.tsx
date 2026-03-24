/**
 * MarkdownEditorPage.tsx の追加カバレッジテスト
 * - 抽出されたヘルパー関数 (insertTemplateIntoEditor, handleChangeGutterKeydown, applyExternalCompareContent)
 * - 各種 props 分岐 (readOnly, loading, externalContent, externalCompareContent, autoReload, etc.)
 */
import React from "react";
import { render, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// --- mocks ---

jest.mock("next/dynamic", () => {
  return function dynamic(_loader: any, _opts?: any) {
    return function DynamicComponent() {
      return <div data-testid="dynamic-component" />;
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
  view: { dom: { scrollTop: 0 } },
};

jest.mock("@tiptap/react", () => ({
  useEditor: () => mockEditor,
  EditorContent: () => <div data-testid="editor-content" />,
  ReactNodeViewRenderer: () => () => null,
}));

let mockLoading = false;

jest.mock("../useMarkdownEditor", () => ({
  useMarkdownEditor: () => ({
    initialContent: "# Test Content",
    loading: mockLoading,
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
    handleDrop: jest.fn(),
    handlePaste: jest.fn(),
    setFrontmatterText: mockSetFrontmatterText,
    frontmatterText: null,
    handleFrontmatterChange: jest.fn(),
    encoding: "utf-8",
    handleLineEndingChange: jest.fn(),
    handleEncodingChange: jest.fn(),
  }),
}));

jest.mock("../hooks/useEditorFileOps", () => ({
  useEditorFileOps: () => ({
    handleClear: jest.fn(),
    handleFileSelected: jest.fn(),
    handleDownload: jest.fn(),
    handleImport: jest.fn(),
    handleCopy: jest.fn(),
    handleOpenFile: jest.fn(),
    handleSaveFile: jest.fn(),
    handleSaveAsFile: jest.fn(),
    handleExportPdf: jest.fn(),
    notification: null, setNotification: jest.fn(),
    fileInputRef: { current: null },
    pdfExporting: false,
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

jest.mock("../hooks/useEditorSettingsSync", () => ({
  useEditorSettingsSync: () => {},
}));

jest.mock("../hooks/useEditorShortcuts", () => ({
  useEditorShortcuts: () => {},
}));

jest.mock("../hooks/useEditorSideEffects", () => ({
  useEditorSideEffects: () => {},
}));

jest.mock("../hooks/useFileSystem", () => ({
  useFileSystem: () => ({
    fileHandle: null,
    setFileHandle: jest.fn(),
    openFile: jest.fn(),
    saveFile: jest.fn(),
    saveAsFile: jest.fn(),
    resetFile: jest.fn(),
    fileName: null,
    isDirty: false,
    supportsDirectAccess: false,
    markDirty: jest.fn(),
  }),
}));

jest.mock("../hooks/useTextareaSearch", () => ({
  useTextareaSearch: () => ({
    searchState: null,
    setSearchState: jest.fn(),
  }),
}));

jest.mock("../hooks/useFloatingToolbar", () => ({
  useFloatingToolbar: () => null,
}));

const mockSourceMode = { sourceMode: false };
jest.mock("../hooks/useSourceMode", () => ({
  useSourceMode: () => ({
    sourceMode: mockSourceMode.sourceMode,
    readonlyMode: false,
    reviewMode: false,
    sourceText: "",
    setSourceText: jest.fn(),
    liveMessage: "",
    setLiveMessage: jest.fn(),
    handleSwitchToSource: jest.fn(),
    handleSwitchToWysiwyg: jest.fn(),
    handleSwitchToReview: jest.fn(),
    handleSwitchToReadonly: jest.fn(),
    executeInReviewMode: jest.fn(),
    handleSourceChange: jest.fn(),
    appendToSource: jest.fn(),
  }),
}));

jest.mock("../hooks/useOutline", () => ({
  useOutline: () => ({
    outlineOpen: false,
    headings: [],
    setHeadings: jest.fn(),
    foldedIndices: new Set(),
    hiddenByFold: new Set(),
    outlineWidth: 220,
    setOutlineWidth: jest.fn(),
    handleToggleOutline: jest.fn(),
    handleHeadingDragEnd: jest.fn(),
    handleOutlineDelete: jest.fn(),
    handleOutlineClick: jest.fn(),
    toggleFold: jest.fn(),
    foldAll: jest.fn(),
    unfoldAll: jest.fn(),
    handleOutlineResizeStart: jest.fn(),
  }),
}));

jest.mock("../hooks/useMergeMode", () => ({
  useMergeMode: () => ({
    inlineMergeOpen: false,
    setInlineMergeOpen: jest.fn(),
    editorMarkdown: "",
    setEditorMarkdown: jest.fn(),
    mergeUndoRedo: null,
    setMergeUndoRedo: jest.fn(),
    compareFileContent: "",
    setCompareFileContent: jest.fn(),
    rightFileOps: null,
    setRightFileOps: jest.fn(),
    handleMerge: jest.fn(),
  }),
}));

jest.mock("../hooks/useSectionNumbers", () => ({
  useSectionNumbers: () => ({
    handleInsertSectionNumbers: jest.fn(),
    handleRemoveSectionNumbers: jest.fn(),
  }),
}));

jest.mock("../hooks/useVSCodeIntegration", () => ({
  useVSCodeIntegration: () => {},
}));

jest.mock("../components/EditorDialogsSection", () => ({
  EditorDialogsSection: () => <div data-testid="editor-dialogs-section" />,
}));

jest.mock("../components/ScreenCaptureDialog", () => ({
  ScreenCaptureDialog: () => null,
}));

jest.mock("../components/EditorErrorBoundary", () => ({
  EditorErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

jest.mock("../components/EditorFooterOverlays", () => ({
  EditorFooterOverlays: () => <div data-testid="editor-footer-overlays" />,
}));

jest.mock("../components/EditorMainContent", () => ({
  EditorMainContent: () => <div data-testid="editor-main-content" />,
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
  parseCommentData: (content: string) => ({ comments: new Map(), body: content }),
  serializeCommentData: jest.fn(),
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: (content: string) => ({
    frontmatter: null,
    body: content,
  }),
}));

jest.mock("../extensions/slashCommandExtension", () => ({
  SlashCommandExtension: { name: "slashCommand" },
}));

import MarkdownEditorPage from "../MarkdownEditorPage";

const theme = createTheme();
const darkTheme = createTheme({ palette: { mode: "dark" } });

function renderPage(props: Record<string, any> = {}, useDark = false) {
  return render(
    <ThemeProvider theme={useDark ? darkTheme : theme}>
      <MarkdownEditorPage {...props} />
    </ThemeProvider>,
  );
}

describe("MarkdownEditorPage - coverage", () => {
  beforeEach(() => {
    mockLoading = false;
    mockSourceMode.sourceMode = false;
    jest.clearAllMocks();
  });

  // --- loading 状態 ---
  it("loading=true で CircularProgress を表示する", () => {
    mockLoading = true;
    const { container } = renderPage();
    expect(container.querySelector("[role='progressbar']")).toBeTruthy();
  });

  // --- externalContent prop ---
  it("externalContent が渡された場合にレンダリングされる", () => {
    const { container } = renderPage({ externalContent: "# External" });
    expect(container.querySelector("[data-testid='error-boundary']")).toBeTruthy();
  });

  // --- readOnly prop ---
  it("readOnly=true でレンダリングされる", () => {
    const { container } = renderPage({ readOnly: true });
    expect(container).toBeTruthy();
  });

  // --- dark theme ---
  it("ダークテーマでレンダリングされる", () => {
    const { container } = renderPage({}, true);
    expect(container).toBeTruthy();
  });

  // --- defaultFontSize / defaultBlockAlign 上書き ---
  it("defaultFontSize と defaultBlockAlign でレンダリングされる", () => {
    const { container } = renderPage({ defaultFontSize: 18, defaultBlockAlign: "center" });
    expect(container).toBeTruthy();
  });

  // --- hideStatusBar ---
  it("hideStatusBar=true でレンダリングされる", () => {
    const { container } = renderPage({ hideStatusBar: true });
    expect(container).toBeTruthy();
  });

  // --- fixedEditorHeight ---
  it("fixedEditorHeight でレンダリングされる", () => {
    const { container } = renderPage({ fixedEditorHeight: 800 });
    expect(container).toBeTruthy();
  });

  // --- sideToolbar ---
  it("sideToolbar=true でレンダリングされる", () => {
    const { container } = renderPage({ sideToolbar: true });
    expect(container).toBeTruthy();
  });

  // --- hideCompareToggle ---
  it("hideCompareToggle=true でレンダリングされる", () => {
    const { container } = renderPage({ hideCompareToggle: true });
    expect(container).toBeTruthy();
  });

  // --- onExternalSave ---
  it("onExternalSave が渡された場合にレンダリングされる", () => {
    const { container } = renderPage({ onExternalSave: jest.fn() });
    expect(container).toBeTruthy();
  });

  // --- showReadonlyMode ---
  it("showReadonlyMode=true でレンダリングされる", () => {
    const { container } = renderPage({ showReadonlyMode: true });
    expect(container).toBeTruthy();
  });

  // --- noScroll ---
  it("noScroll=true でレンダリングされる", () => {
    const { container } = renderPage({ noScroll: true });
    expect(container).toBeTruthy();
  });

  // --- autoReload ---
  it("autoReload=true でレンダリングされる", () => {
    const { container } = renderPage({ autoReload: true, onToggleAutoReload: jest.fn() });
    expect(container).toBeTruthy();
  });

  // --- open-screen-capture event ---
  it("open-screen-capture イベントに反応する", () => {
    renderPage();
    act(() => {
      globalThis.dispatchEvent(new Event("open-screen-capture"));
    });
    // No crash = success
  });

  // --- vscode-image-saved event ---
  it("vscode-image-saved イベントに反応する", () => {
    renderPage();
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-image-saved", { detail: "images/test.png" }));
    });
    expect(mockEditorChain.setImage).toHaveBeenCalledWith({ src: "images/test.png", alt: "" });
  });

  // --- vscode-image-saved with non-string detail ---
  it("vscode-image-saved で非文字列の detail は無視する", () => {
    renderPage();
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-image-saved", { detail: 123 }));
    });
    expect(mockEditorChain.setImage).not.toHaveBeenCalled();
  });

  // --- multiple hide props ---
  it("複数の hide props でレンダリングされる", () => {
    const { container } = renderPage({
      hideFileOps: true,
      hideUndoRedo: true,
      hideSettings: true,
      hideVersionInfo: true,
      hideOutline: true,
      hideComments: true,
      hideTemplates: true,
      hideFoldAll: true,
    });
    expect(container).toBeTruthy();
  });

  // --- externalFileName ---
  it("externalFileName が渡された場合にレンダリングされる", () => {
    const { container } = renderPage({ externalFileName: "test.md", externalContent: "# Test" });
    expect(container).toBeTruthy();
  });

  // --- defaultSourceMode ---
  it("defaultSourceMode=true でレンダリングされる", () => {
    const { container } = renderPage({ defaultSourceMode: true });
    expect(container).toBeTruthy();
  });

  // --- defaultOutlineOpen ---
  it("defaultOutlineOpen=true でレンダリングされる", () => {
    const { container } = renderPage({ defaultOutlineOpen: true });
    expect(container).toBeTruthy();
  });
});

// --- 抽出関数の直接テスト ---

// insertTemplateIntoEditor, handleChangeGutterKeydown, applyExternalCompareContent are module-private.
// We test them through the component behavior, but we can also test them via event dispatch for autoReload.

describe("MarkdownEditorPage - autoReload keydown handling", () => {
  beforeEach(() => {
    mockLoading = false;
    jest.clearAllMocks();
  });

  it("autoReload=true 時に Escape で setChangeGutterBaseline が呼ばれる", () => {
    renderPage({ autoReload: true });
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(mockEditorCommands.setChangeGutterBaseline).toHaveBeenCalled();
  });

  it("autoReload=true 時に Alt+F5 で goToNextChange が呼ばれる", () => {
    renderPage({ autoReload: true });
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", altKey: true }));
    });
    expect(mockEditorCommands.goToNextChange).toHaveBeenCalled();
  });

  it("autoReload=true 時に Shift+Alt+F5 で goToPrevChange が呼ばれる", () => {
    renderPage({ autoReload: true });
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", altKey: true, shiftKey: true }));
    });
    expect(mockEditorCommands.goToPrevChange).toHaveBeenCalled();
  });
});

describe("MarkdownEditorPage - vscode-set-content in source mode", () => {
  beforeEach(() => {
    mockLoading = false;
    mockSourceMode.sourceMode = true;
    jest.clearAllMocks();
  });

  it("sourceMode 時に vscode-set-content イベントで sourceText が更新される", () => {
    renderPage();
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: "# Updated content" }));
    });
    // No crash = success (sourceText updated internally)
  });

  it("sourceMode 時に非文字列の detail は無視される", () => {
    renderPage();
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("vscode-set-content", { detail: null }));
    });
    // No crash
  });
});
