import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

// --- Mocks ---
jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: React.PropsWithChildren) => <div data-testid="node-view-wrapper">{children}</div>,
  NodeViewContent: () => <code data-testid="node-view-content" />,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: {
      mode: "light",
      primary: { main: "#1976d2" },
      divider: "#e0e0e0",
      text: { secondary: "#666", disabled: "#999" },
      action: { hover: "#f5f5f5" },
      background: { paper: "#fff" },
      grey: { 900: "#212121", 50: "#fafafa" },
    },
    spacing: (n: number) => `${n * 8}px`,
  }),
}));

jest.mock("../../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ fontSize: 16, lineHeight: 1.6 }),
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

jest.mock("../../components/CodeBlockEditDialog", () => ({
  CodeBlockEditDialog: ({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) => <div data-testid="fs-dialog">{toolbarExtra}</div>,
}));


import { HtmlPreviewBlock } from "../../components/codeblock/HtmlPreviewBlock";

function createMockEditor(): NodeViewProps["editor"] {
  return {
    chain: jest.fn(),
    commands: { setTextSelection: jest.fn() },
    state: { selection: { from: 0 } },
  } as unknown as NodeViewProps["editor"];
}

function setup(overrides?: { code?: string }) {
  const fsSearch = { reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() };
  const htmlCode = overrides?.code ?? "<p>Hello World</p>";
  const props = {
    editor: createMockEditor(),
    node: { attrs: { language: "html", width: null }, content: { size: 10 } } as never,
    updateAttributes: jest.fn(),
    getPos: jest.fn(() => 0) as never,
    codeCollapsed: true,
    isSelected: true,
    selectNode: jest.fn(),
    code: htmlCode,
    handleCopyCode: jest.fn(),
    handleDeleteBlock: jest.fn(),
    deleteDialogOpen: false,
    setDeleteDialogOpen: jest.fn(),
    editOpen: false,
    setEditOpen: jest.fn(),
    fsCode: "",
    onFsCodeChange: jest.fn(),
    fsTextareaRef: { current: null },
    fsSearch: fsSearch as never,
    handleFsTextChange: jest.fn(),
    t: (key: string) => key,
    isDark: false,
  };
  const result = render(<HtmlPreviewBlock {...props} />);
  return { ...result, ...props };
}

describe("HtmlPreviewBlock", () => {
  test("htmlPreview ラベル表示", () => {
    setup();
    expect(screen.getByText("htmlPreview")).toBeTruthy();
  });

  test("HTML プレビューが表示される", () => {
    setup({ code: "<p>Test Content</p>" });
    expect(screen.getByText("Test Content")).toBeTruthy();
  });

  test("copyCode ボタン表示", () => {
    setup();
    expect(screen.getByLabelText("copyCode")).toBeTruthy();
  });

});
