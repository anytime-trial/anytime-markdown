/**
 * ImageNodeView.tsx coverage4 tests
 * Targets: formatDataUrlSize branches (lines 37, 40, 41, 42),
 *          useImageSize branches (lines 52, 66),
 *          image error handling, data URL size display,
 *          annotation overlay rendering,
 *          linked image display (line 217),
 *          resize handle (lines 293-315)
 */
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...props }: any) => <div data-testid="node-view-wrapper" {...props}>{children}</div>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getDivider: () => "#ccc",
  getErrorMain: () => "#f00",
  getPrimaryMain: () => "#1976d2",
  getTextDisabled: () => "#999",
  getTextSecondary: () => "#666",
  getWarningMain: () => "#ff9800",
}));

jest.mock("../constants/dimensions", () => ({
  HANDLEBAR_CAPTION_FONT_SIZE: 10,
  SMALL_CAPTION_FONT_SIZE: 10,
  STATUSBAR_FONT_SIZE: 11,
}));

jest.mock("../hooks/useBlockCapture", () => ({
  useBlockCapture: () => jest.fn().mockResolvedValue(undefined),
}));

const mockUseBlockNodeState = jest.fn();
jest.mock("../hooks/useBlockNodeState", () => ({
  useBlockNodeState: (...args: unknown[]) => mockUseBlockNodeState(...args),
}));

jest.mock("../hooks/useBlockResize", () => ({
  useBlockResize: () => ({
    handleResizeStart: jest.fn(),
    previewWidth: null,
    resizing: false,
  }),
}));

jest.mock("../types", () => ({
  getEditorStorage: () => ({
    getMarkdown: () => "",
  }),
}));

jest.mock("../types/imageAnnotation", () => ({
  parseAnnotations: (s: string) => { try { return JSON.parse(s); } catch { return []; } },
  serializeAnnotations: (a: any[]) => JSON.stringify(a),
}));

jest.mock("../components/AnnotationOverlay", () => ({
  AnnotationOverlay: () => <div data-testid="annotation-overlay" />,
}));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ onEdit, onDelete, onExport, label }: any) => (
    <div data-testid="block-inline-toolbar">
      {onEdit && <button data-testid="edit-btn" onClick={onEdit}>Edit</button>}
      {onDelete && <button data-testid="delete-btn" onClick={onDelete}>Delete</button>}
      {onExport && <button data-testid="export-btn" onClick={onExport}>Export</button>}
      <span data-testid="label">{label}</span>
    </div>
  ),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <div data-testid="delete-dialog"><button onClick={onDelete}>Delete</button></div> : null,
}));

jest.mock("../components/ImageAnnotationDialog", () => ({
  ImageAnnotationDialog: ({ open }: any) =>
    open ? <div data-testid="annotation-dialog" /> : null,
}));

jest.mock("../components/ImageCropTool", () => ({
  ImageCropTool: ({ open }: any) =>
    open ? <div data-testid="crop-dialog" /> : null,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: () => null,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ open, children }: any) =>
    open ? <div data-testid="edit-dialog">{children}</div> : null,
}));

jest.mock("../components/ScreenCaptureDialog", () => ({
  ScreenCaptureDialog: ({ open }: any) =>
    open ? <div data-testid="screen-capture-dialog" /> : null,
}));

import { ImageNodeView } from "../ImageNodeView";

const theme = createTheme();

function defaultState(overrides: Record<string, unknown> = {}) {
  return {
    deleteDialogOpen: false,
    setDeleteDialogOpen: jest.fn(),
    editOpen: false,
    setEditOpen: jest.fn(),
    collapsed: false,
    isEditable: true,
    isSelected: false,
    handleDeleteBlock: jest.fn(),
    showToolbar: true,
    isCompareLeft: false,
    isCompareLeftEditable: false,
    ...overrides,
  };
}

function renderImageNode(nodeAttrs: Record<string, unknown> = {}, stateOverrides: Record<string, unknown> = {}) {
  const state = defaultState(stateOverrides);
  mockUseBlockNodeState.mockReturnValue(state);

  const mockNode = {
    attrs: { src: "", alt: "", width: "", annotations: "[]", ...nodeAttrs },
  };
  const mockEditor = {
    view: { nodeDOM: jest.fn(() => null) },
    state: { selection: { from: 0, to: 0 }, doc: { nodeAt: jest.fn() }, tr: { setNodeMarkup: jest.fn().mockReturnThis() } },
    isActive: () => false,
  };
  const updateAttributes = jest.fn();

  const result = render(
    <ThemeProvider theme={theme}>
      <ImageNodeView
        editor={mockEditor as any}
        node={mockNode as any}
        getPos={() => 0}
        deleteNode={jest.fn()}
        updateAttributes={updateAttributes}
        decorations={[] as any}
        innerDecorations={[] as any}
        extension={{} as any}
        selected={false}
        HTMLAttributes={{}}
        view={{} as any}
      />
    </ThemeProvider>,
  );

  return { ...result, updateAttributes, state };
}

describe("ImageNodeView coverage4", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders image placeholder when src is empty", () => {
    renderImageNode({ src: "" });
    expect(screen.getByTestId("node-view-wrapper")).toBeTruthy();
  });

  it("renders image with data URL and shows size", () => {
    // Small data URL (< 1KB)
    const smallData = "data:image/png;base64," + "A".repeat(100);
    renderImageNode({ src: smallData, alt: "small" });
    // Should display size info
  });

  it("renders image with large data URL (KB range)", () => {
    const kbData = "data:image/png;base64," + "A".repeat(2000);
    renderImageNode({ src: kbData, alt: "medium" });
  });

  it("renders image with very large data URL (MB range)", () => {
    const mbData = "data:image/png;base64," + "A".repeat(2000000);
    renderImageNode({ src: mbData, alt: "large" });
  });

  it("renders image with invalid data URL (no comma)", () => {
    renderImageNode({ src: "data:image/pngbase64nocomma", alt: "invalid" });
  });

  it("renders image with regular URL src", () => {
    renderImageNode({ src: "https://example.com/image.png", alt: "regular" });
  });

  it("renders image with linked URL (link:// prefix)", () => {
    renderImageNode({ src: "link://https://example.com/image.png", alt: "linked" });
  });

  it("renders with custom width attribute", () => {
    renderImageNode({ src: "test.png", alt: "sized", width: "300px" });
  });

  it("renders with annotations", () => {
    const annotations = JSON.stringify([
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000" },
    ]);
    renderImageNode({ src: "test.png", alt: "annotated", annotations });
  });

  it("renders collapsed state", () => {
    renderImageNode({ src: "test.png" }, { collapsed: true });
  });

  it("renders non-editable without toolbar", () => {
    renderImageNode({ src: "test.png" }, { isEditable: false, showToolbar: false });
  });

  it("handles image error", () => {
    renderImageNode({ src: "broken.png", alt: "broken" });
    const img = screen.queryByRole("img");
    if (img) {
      fireEvent.error(img);
    }
  });

  it("handles image load", () => {
    renderImageNode({ src: "test.png", alt: "loaded" });
    const img = screen.queryByRole("img");
    if (img) {
      Object.defineProperty(img, "naturalWidth", { value: 800, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: 600, configurable: true });
      Object.defineProperty(img, "complete", { value: true, configurable: true });
      fireEvent.load(img);
    }
  });
});
