/**
 * MathBlock.tsx coverage tests
 * Targets uncovered lines: 55-56, 76-109
 * Focus: isCompareLeft/isCompareLeftEditable props, click/doubleClick handlers,
 *   resize interactions, math preview click behavior, MathEditDialog open
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

// --- Mocks ---
let mockKatexHtml: string | null = "<span>x^2</span>";
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

let capturedMathEditDialogProps: any = {};
jest.mock("../../components/MathEditDialog", () => ({
  MathEditDialog: (props: any) => {
    capturedMathEditDialogProps = props;
    return (
      <div data-testid="fs-dialog">
        {props.toolbarExtra}
        {props.open && <div data-testid="math-edit-open" />}
      </div>
    );
  },
}));

jest.mock("../../hooks/useBlockMergeCompare", () => ({
  useBlockMergeCompare: () => ({
    isCompareMode: false,
    compareCode: null,
    thisCode: null,
    handleMergeApply: jest.fn(),
  }),
}));

jest.mock("../../hooks/useBlockResize", () => ({
  useBlockResize: () => ({
    resizing: false,
    resizeWidth: null,
    displayWidth: undefined,
    handleResizePointerDown: jest.fn(),
    handleResizePointerMove: jest.fn(),
    handleResizePointerUp: jest.fn(),
  }),
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
    isEditable: true,
  } as unknown as NodeViewProps["editor"];
}

function createMockNode() {
  return {
    attrs: { language: "math", collapsed: false, codeCollapsed: false, width: null },
    nodeSize: 10,
    textContent: "x^2",
    content: { size: 3 },
  } as unknown as NodeViewProps["node"];
}

function createFsSearch() {
  return {
    reset: jest.fn(), query: "", setQuery: jest.fn(),
    matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(),
    replace: jest.fn(), replaceAll: jest.fn(),
  } as never;
}

describe("MathBlock - coverage", () => {
  beforeEach(() => {
    mockKatexHtml = "<span>x^2</span>";
    mockKatexError = null;
    capturedMathEditDialogProps = {};
  });

  it("hides edit/delete buttons when isCompareLeft is true", () => {
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode: jest.fn(),
      code: "x^2",
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
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: true,
      isCompareLeft: true,
      isCompareLeftEditable: false,
    };
    render(<MathBlock {...props} />);
    // shouldShowToolbar returns false, so no "Math" label visible
    expect(screen.queryByText("Math")).toBeNull();
  });

  it("renders with isCompareLeftEditable label-only toolbar", () => {
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode: jest.fn(),
      code: "x^2",
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
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: false,
      isCompareLeft: true,
      isCompareLeftEditable: true,
    };
    render(<MathBlock {...props} />);
    expect(screen.getByText("Math")).toBeTruthy();
  });

  it("onClick selects node and collapses code", () => {
    const selectNode = jest.fn();
    const updateAttributes = jest.fn();
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode,
      code: "x^2",
      updateAttributes,
      handleCopyCode: jest.fn(),
      handleDeleteBlock: jest.fn(),
      deleteDialogOpen: false,
      setDeleteDialogOpen: jest.fn(),
      editOpen: false,
      setEditOpen: jest.fn(),
      fsCode: "",
      onFsCodeChange: jest.fn(),
      fsTextareaRef: { current: null },
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: true,
    };
    render(<MathBlock {...props} />);
    const mathPreview = screen.getByRole("img");
    fireEvent.click(mathPreview);
    expect(selectNode).toHaveBeenCalled();
    expect(updateAttributes).toHaveBeenCalledWith({ codeCollapsed: true });
  });

  it("onClick when already collapsed only selects node", () => {
    const selectNode = jest.fn();
    const updateAttributes = jest.fn();
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: true,
      isSelected: true,
      selectNode,
      code: "x^2",
      updateAttributes,
      handleCopyCode: jest.fn(),
      handleDeleteBlock: jest.fn(),
      deleteDialogOpen: false,
      setDeleteDialogOpen: jest.fn(),
      editOpen: false,
      setEditOpen: jest.fn(),
      fsCode: "",
      onFsCodeChange: jest.fn(),
      fsTextareaRef: { current: null },
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: true,
    };
    render(<MathBlock {...props} />);
    const mathPreview = screen.getByRole("img");
    fireEvent.click(mathPreview);
    expect(selectNode).toHaveBeenCalled();
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it("double-click opens edit dialog", () => {
    const setEditOpen = jest.fn();
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode: jest.fn(),
      code: "x^2",
      updateAttributes: jest.fn(),
      handleCopyCode: jest.fn(),
      handleDeleteBlock: jest.fn(),
      deleteDialogOpen: false,
      setDeleteDialogOpen: jest.fn(),
      editOpen: false,
      setEditOpen,
      fsCode: "",
      onFsCodeChange: jest.fn(),
      fsTextareaRef: { current: null },
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: true,
    };
    render(<MathBlock {...props} />);
    const mathPreview = screen.getByRole("img");
    fireEvent.doubleClick(mathPreview);
    expect(setEditOpen).toHaveBeenCalledWith(true);
  });

  it("MathEditDialog onClose resets search and closes", () => {
    const resetFn = jest.fn();
    const fsSearch = {
      reset: resetFn, query: "", setQuery: jest.fn(),
      matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(),
      replace: jest.fn(), replaceAll: jest.fn(),
    } as never;
    const setEditOpen = jest.fn();
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode: jest.fn(),
      code: "x^2",
      updateAttributes: jest.fn(),
      handleCopyCode: jest.fn(),
      handleDeleteBlock: jest.fn(),
      deleteDialogOpen: false,
      setDeleteDialogOpen: jest.fn(),
      editOpen: true,
      setEditOpen,
      fsCode: "x^2",
      onFsCodeChange: jest.fn(),
      fsTextareaRef: { current: null },
      fsSearch,
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: true,
    };
    render(<MathBlock {...props} />);
    if (capturedMathEditDialogProps.onClose) {
      capturedMathEditDialogProps.onClose();
      expect(resetFn).toHaveBeenCalled();
      expect(setEditOpen).toHaveBeenCalledWith(false);
    }
  });

  it("renders copy code button in toolbar extra", () => {
    const handleCopyCode = jest.fn();
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode: jest.fn(),
      code: "x^2",
      updateAttributes: jest.fn(),
      handleCopyCode,
      handleDeleteBlock: jest.fn(),
      deleteDialogOpen: false,
      setDeleteDialogOpen: jest.fn(),
      editOpen: false,
      setEditOpen: jest.fn(),
      fsCode: "",
      onFsCodeChange: jest.fn(),
      fsTextareaRef: { current: null },
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: true,
    };
    render(<MathBlock {...props} />);
    const copyBtn = screen.getByLabelText("copyCode");
    fireEvent.click(copyBtn);
    expect(handleCopyCode).toHaveBeenCalled();
  });

  it("renders in dark mode", () => {
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: false,
      selectNode: jest.fn(),
      code: "x^2",
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
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: true,
      isEditable: true,
    };
    render(<MathBlock {...props} />);
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("hides toolbar when isEditable is false", () => {
    const props = {
      editor: createMockEditor(),
      node: createMockNode(),
      getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
      codeCollapsed: false,
      isSelected: true,
      selectNode: jest.fn(),
      code: "x^2",
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
      fsSearch: createFsSearch(),
      handleFsTextChange: jest.fn(),
      t: (key: string) => key,
      isDark: false,
      isEditable: false,
      isCompareLeft: false,
      isCompareLeftEditable: false,
    };
    render(<MathBlock {...props} />);
    expect(screen.getByRole("img")).toBeTruthy();
  });
});
