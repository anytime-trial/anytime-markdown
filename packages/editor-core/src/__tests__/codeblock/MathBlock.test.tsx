import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

// --- Mocks ---
let mockKatexHtml: string | null = "<span>E=mc^2</span>";
let mockKatexError: string | null = null;

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

jest.mock("../../hooks/useKatexRender", () => ({
  useKatexRender: () => ({ html: mockKatexHtml, error: mockKatexError }),
  MATH_SANITIZE_CONFIG: {},
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

jest.mock("../../components/MathEditDialog", () => ({
  MathEditDialog: ({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) => <div data-testid="fs-dialog">{toolbarExtra}</div>,
}));

import { MathBlock } from "../../components/codeblock/MathBlock";

function createMockEditor(): NodeViewProps["editor"] {
  const run = jest.fn();
  const commandFn = jest.fn(() => ({ run }));
  return {
    chain: jest.fn(() => ({ command: commandFn })),
    commands: { setTextSelection: jest.fn() },
    state: { selection: { from: 0 } },
    schema: { text: jest.fn((t: string) => t) },
  } as unknown as NodeViewProps["editor"];
}

function createMockNode() {
  return {
    attrs: { language: "math", collapsed: false, codeCollapsed: true, width: null },
    nodeSize: 10,
    textContent: "E=mc^2",
    content: { size: 6 },
  } as unknown as NodeViewProps["node"];
}

function setup(overrides?: { codeCollapsed?: boolean }) {
  mockKatexHtml = "<span>E=mc^2</span>";
  mockKatexError = null;
  const fsSearch = { reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() };
  const props = {
    editor: createMockEditor(),
    node: createMockNode(),
    getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
    codeCollapsed: overrides?.codeCollapsed ?? true,
    isSelected: true,
    selectNode: jest.fn(),
    code: "E=mc^2",
    updateAttributes: jest.fn(),
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
  const result = render(<MathBlock {...props} />);
  return { ...result, ...props };
}

describe("MathBlock", () => {
  test("Math ラベル表示", () => {
    setup();
    expect(screen.getByText("Math")).toBeTruthy();
  });

  test("KaTeX プレビュー表示", () => {
    setup();
    expect(screen.getByText("E=mc^2")).toBeTruthy();
  });

  test("エラー時 -> Alert 表示", () => {
    mockKatexError = "Parse error";
    mockKatexHtml = null;
    const { container } = render(
      <MathBlock
        editor={createMockEditor()}
        node={createMockNode()}
        updateAttributes={jest.fn()}
        getPos={jest.fn(() => 0) as unknown as NodeViewProps["getPos"]}
        codeCollapsed={true}
        isSelected={true}
        selectNode={jest.fn()}
        code="invalid"
        handleCopyCode={jest.fn()}
        handleDeleteBlock={jest.fn()}
        deleteDialogOpen={false}
        setDeleteDialogOpen={jest.fn()}
        editOpen={false}
        setEditOpen={jest.fn()}
        fsCode=""
        onFsCodeChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={{ reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() } as never}
        handleFsTextChange={jest.fn()}
        t={(key: string) => key}
        isDark={false}
      />
    );
    expect(screen.getByText("Parse error")).toBeTruthy();
  });

});
