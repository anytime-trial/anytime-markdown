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

jest.mock("../../components/CodeBlockEditDialog", () => ({
  CodeBlockEditDialog: () => null,
}));

import { RegularCodeBlock } from "../../components/codeblock/RegularCodeBlock";

function createMockNode(lang?: string) {
  return {
    attrs: { language: lang ?? "javascript", collapsed: false, codeCollapsed: true, width: null },
    nodeSize: 10,
    textContent: "console.log('hello')",
    content: { size: 19 },
  } as unknown as NodeViewProps["node"];
}

function setup(overrides?: { isSelected?: boolean; language?: string }) {
  const fsSearch = { reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() };
  const mockNode = createMockNode(overrides?.language);
  const props = {
    editor: { isEditable: true } as never,
    node: mockNode,
    getPos: (() => 0) as never,
    code: mockNode.textContent,
    isSelected: overrides?.isSelected ?? true,
    handleCopyCode: jest.fn(),
    handleDeleteBlock: jest.fn(),
    deleteDialogOpen: false,
    setDeleteDialogOpen: jest.fn(),
    editOpen: false,
    setEditOpen: jest.fn(),
    tryCloseEdit: jest.fn(),
    onFsApply: jest.fn(),
    fsDirty: false,
    discardDialogOpen: false,
    setDiscardDialogOpen: jest.fn(),
    handleDiscardConfirm: jest.fn(),
    fsCode: "",
    onFsCodeChange: jest.fn(),
    fsTextareaRef: { current: null },
    fsSearch: fsSearch as never,
    handleFsTextChange: jest.fn(),
    t: (key: string) => key,
    isDark: false,
    isEditable: true,
  };
  const result = render(<RegularCodeBlock {...props} />);
  return { ...result, ...props };
}

describe("RegularCodeBlock", () => {
  test("language 表示: Code (javascript)", () => {
    setup({ language: "javascript" });
    expect(screen.getByText("Code (javascript)")).toBeTruthy();
  });

  test("language なし -> Code 表示", () => {
    setup({ language: "" });
    expect(screen.getByText("Code")).toBeTruthy();
  });

  test("delete ボタン -> setDeleteDialogOpen 呼び出し", () => {
    const { setDeleteDialogOpen } = setup();
    fireEvent.click(screen.getByLabelText("delete"));
    expect(setDeleteDialogOpen).toHaveBeenCalledWith(true);
  });
});
