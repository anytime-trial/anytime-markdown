/**
 * MarkdownEditorPage.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
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

jest.mock("@tiptap/react", () => ({
  useEditor: () => null,
  EditorContent: () => <div data-testid="editor-content" />,
  ReactNodeViewRenderer: () => () => null,
}));

jest.mock("../useMarkdownEditor", () => ({
  useMarkdownEditor: () => ({
    initialContent: "",
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
  useEditorBlockActions: () => ({ handleCapture: jest.fn() }),
}));

jest.mock("../hooks/useEditorCommentNotifications", () => ({
  useEditorCommentNotifications: () => {},
}));

jest.mock("../hooks/useEditorConfig", () => ({
  useEditorConfig: () => ({
    sourceMode: false,
    setSourceMode: jest.fn(),
    sourceText: "",
    setSourceText: jest.fn(),
    outlineOpen: false,
    setOutlineOpen: jest.fn(),
    showPreview: false,
    setShowPreview: jest.fn(),
  }),
}));

jest.mock("../hooks/useEditorDialogs", () => ({
  useEditorDialogs: () => ({
    settingsOpen: false,
    setSettingsOpen: jest.fn(),
    sampleAnchorEl: null,
    setSampleAnchorEl: jest.fn(),
    diagramAnchorEl: null,
    setDiagramAnchorEl: jest.fn(),
    helpAnchorEl: null,
    setHelpAnchorEl: jest.fn(),
    templateAnchorEl: null,
    setTemplateAnchorEl: jest.fn(),
    headingMenu: null,
    setHeadingMenu: jest.fn(),
    versionDialogOpen: false,
    setVersionDialogOpen: jest.fn(),
    imageCropState: null,
    setImageCropState: jest.fn(),
    linkDialogState: null,
    setLinkDialogState: jest.fn(),
    screenCaptureOpen: false,
    setScreenCaptureOpen: jest.fn(),
  }),
}));

jest.mock("../hooks/useEditorFileHandling", () => ({
  useEditorFileHandling: () => ({
    handleDrop: jest.fn(),
    handlePaste: jest.fn(),
    setFrontmatterText: jest.fn(),
    frontmatterText: null,
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
    notification: null,
    fileInputRef: { current: null },
    pdfExporting: false,
  }),
}));

jest.mock("../hooks/useEditorHeight", () => ({
  useEditorHeight: () => ({ editorHeight: 500 }),
}));

jest.mock("../hooks/useEditorMenuState", () => ({
  useEditorMenuState: () => ({
    menuState: {},
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
  }),
}));

jest.mock("../hooks/useTextareaSearch", () => ({
  useTextareaSearch: () => ({
    searchState: null,
    setSearchState: jest.fn(),
  }),
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

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: (md: string) => md,
  preserveBlankLines: (md: string) => md,
}));

jest.mock("../extensions/slashCommandExtension", () => ({
  SlashCommandExtension: { name: "slashCommand" },
}));

import MarkdownEditorPage from "../MarkdownEditorPage";

const theme = createTheme();

describe("MarkdownEditorPage", () => {
  it("renders without crashing with default props", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MarkdownEditorPage />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders without crashing with readOnly", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MarkdownEditorPage readOnly />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders without crashing with hideToolbar", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MarkdownEditorPage hideToolbar />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
