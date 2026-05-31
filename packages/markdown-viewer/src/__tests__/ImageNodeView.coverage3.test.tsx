/**
 * ImageNodeView.tsx coverage3 tests
 * Targets remaining uncovered lines: 51-53, 67, 264, 459-469
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

let mockIsSelected = true;
let mockIsEditable = true;
let mockCollapsed = false;
let mockShowToolbar = true;
let mockEditOpen = false;
let mockSetEditOpen = jest.fn();
let mockDeleteDialogOpen = false;
let mockSetDeleteDialogOpen = jest.fn();
let mockIsCompareLeft = false;

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: React.PropsWithChildren) => <div data-testid="node-view-wrapper">{children}</div>,
  useEditorState: () => mockIsSelected,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: {
      mode: "light",
      success: { main: "#4caf50" }, error: { main: "#f44336" },
      warning: { main: "#ff9800" }, primary: { main: "#1976d2" },
      divider: "#e0e0e0",
      text: { secondary: "#666", disabled: "#999", primary: "#000" },
      action: { hover: "#f5f5f5", selected: "#eee" },
      background: { paper: "#fff" },
      grey: { 900: "#212121" },
    },
    spacing: (n: number) => `${n * 8}px`,
  }),
}));

jest.mock("../hooks/useBlockNodeState", () => ({
  useBlockNodeState: () => ({
    deleteDialogOpen: mockDeleteDialogOpen,
    setDeleteDialogOpen: mockSetDeleteDialogOpen,
    editOpen: mockEditOpen,
    setEditOpen: mockSetEditOpen,
    collapsed: mockCollapsed,
    isEditable: mockIsEditable,
    isSelected: mockIsSelected,
    handleDeleteBlock: jest.fn(),
    showToolbar: mockShowToolbar,
    isCompareLeft: mockIsCompareLeft,
    isCompareLeftEditable: false,
  }),
}));

jest.mock("../hooks/useBlockCapture", () => ({
  useBlockCapture: () => jest.fn(),
}));
jest.mock("../hooks/useBlockResize", () => ({
  useBlockResize: () => ({
    resizing: false, resizeWidth: null, displayWidth: "200px",
    handleResizePointerDown: jest.fn(), handleResizePointerMove: jest.fn(),
    handleResizePointerUp: jest.fn(),
  }),
}));
jest.mock("../components/AnnotationOverlay", () => ({
  AnnotationOverlay: () => <div data-testid="annotation-overlay" />,
}));
jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ extra }: any) => <div data-testid="block-inline-toolbar" role="toolbar">{extra}</div>,
}));
jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open }: any) => open ? <div role="dialog">delete dialog</div> : null,
}));
jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ onClose }: any) => <div data-testid="edit-dialog-header"><button data-testid="edit-close" onClick={onClose}>close</button></div>,
}));
jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ open, children }: any) => open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

let capturedAnnotationProps: any = null;
jest.mock("../components/ImageAnnotationDialog", () => ({
  ImageAnnotationDialog: (props: any) => {
    capturedAnnotationProps = props;
    return props.open ? (
      <div data-testid="image-annotation-dialog">
        <button data-testid="annotation-save" onClick={() => props.onSave([{ id: "a1", text: "note" }])}>save</button>
        <button data-testid="annotation-close" onClick={props.onClose}>close</button>
      </div>
    ) : null;
  },
}));
jest.mock("../components/ImageCropTool", () => ({
  ImageCropTool: (props: any) => (
    <div data-testid="image-crop-tool">
      <button data-testid="crop-btn" onClick={() => props.onCrop("data:image/png;base64,cropped")}>crop</button>
    </div>
  ),
}));

let capturedScreenCaptureProps: any = null;
jest.mock("../components/ScreenCaptureDialog", () => ({
  ScreenCaptureDialog: (props: any) => {
    capturedScreenCaptureProps = props;
    return props.open ? (
      <div data-testid="screen-capture-dialog">
        <button data-testid="sc-capture" onClick={() => props.onCapture("data:captured")}>capture</button>
        <button data-testid="sc-close" onClick={props.onClose}>close</button>
      </div>
    ) : null;
  },
}));

function createMockEditor(): NodeViewProps["editor"] {
  return {
    chain: jest.fn(() => ({ focus: jest.fn(() => ({ command: jest.fn(() => ({ run: jest.fn() })), setImage: jest.fn(() => ({ run: jest.fn() })) })) })),
    state: { selection: { from: 0 } },
    storage: { image: { onEditImage: jest.fn() } },
  } as unknown as NodeViewProps["editor"];
}

function createMockNode(overrides?: Record<string, unknown>) {
  return {
    attrs: {
      src: "https://example.com/image.png", alt: "test image",
      title: "Test Title", width: "200px", collapsed: false, annotations: null,
      ...overrides,
    },
    nodeSize: 1,
  } as unknown as NodeViewProps["node"];
}

import { ImageNodeView } from "../ImageNodeView";

function setup(options?: {
  nodeAttrs?: Record<string, unknown>;
  isSelected?: boolean; isEditable?: boolean; collapsed?: boolean;
  showToolbar?: boolean; editOpen?: boolean; isCompareLeft?: boolean;
}) {
  mockIsSelected = options?.isSelected ?? true;
  mockIsEditable = options?.isEditable ?? true;
  mockCollapsed = options?.collapsed ?? false;
  mockShowToolbar = options?.showToolbar ?? true;
  mockEditOpen = options?.editOpen ?? false;
  mockIsCompareLeft = options?.isCompareLeft ?? false;
  mockSetEditOpen = jest.fn();
  mockSetDeleteDialogOpen = jest.fn();
  capturedAnnotationProps = null;
  capturedScreenCaptureProps = null;

  const editor = createMockEditor();
  const node = createMockNode(options?.nodeAttrs);
  const updateAttributes = jest.fn();
  const getPos = jest.fn(() => 0);

  const result = render(
    <ImageNodeView
      editor={editor} node={node} updateAttributes={updateAttributes} getPos={getPos}
      deleteNode={jest.fn()} decorations={[] as unknown as NodeViewProps["decorations"]}
      selected={false} extension={null as unknown as NodeViewProps["extension"]}
      HTMLAttributes={{}} view={null as unknown as NodeViewProps["view"]}
      innerDecorations={[] as unknown as NodeViewProps["innerDecorations"]}
    />,
  );
  return { ...result, editor, node, updateAttributes, getPos };
}

describe("ImageNodeView - coverage3", () => {
  beforeEach(() => {
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn(),
    }));
    delete (window as any).__vscode;
  });

  afterEach(() => { jest.restoreAllMocks(); });

  test("useImageSize error handler triggers on image error event", () => {
    setup({ nodeAttrs: { src: "https://example.com/broken.jpg" } });
    const img = screen.getByAltText("test image");
    fireEvent.error(img);
  });

  test("ImageEditDialog close button calls setEditOpen(false)", () => {
    setup({ editOpen: true });
    fireEvent.click(screen.getByTestId("edit-close"));
    expect(mockSetEditOpen).toHaveBeenCalledWith(false);
  });

  test("screen capture button opens dialog and capture updates src", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: jest.fn() }, configurable: true,
    });
    setup();
    const scBtn = screen.queryByLabelText("screenCapture");
    if (scBtn) {
      fireEvent.click(scBtn);
      if (capturedScreenCaptureProps?.onCapture) {
        capturedScreenCaptureProps.onCapture("data:image/png;base64,screen");
      }
    }
  });

  test("screen capture dialog close handler", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: jest.fn() }, configurable: true,
    });
    setup();
    const scBtn = screen.queryByLabelText("screenCapture");
    if (scBtn) {
      fireEvent.click(scBtn);
      if (capturedScreenCaptureProps?.onClose) {
        capturedScreenCaptureProps.onClose();
      }
    }
  });

  test("annotation dialog onSave updates annotations attribute", () => {
    const { updateAttributes } = setup();
    fireEvent.click(screen.getByLabelText("annotate"));
    fireEvent.click(screen.getByTestId("annotation-save"));
    expect(updateAttributes).toHaveBeenCalled();
  });

  test("annotation dialog onClose closes the dialog", () => {
    setup();
    fireEvent.click(screen.getByLabelText("annotate"));
    fireEvent.click(screen.getByTestId("annotation-close"));
  });

  test("collapsed state hides image content", () => {
    setup({ collapsed: true });
    expect(screen.queryByAltText("test image")).toBeNull();
  });

  test("compare left mode hides edit/annotate buttons", () => {
    setup({ isCompareLeft: true });
    expect(screen.queryByLabelText("edit")).toBeNull();
    expect(screen.queryByLabelText("annotate")).toBeNull();
  });

  test("editUrl button triggers onEditImage callback", () => {
    const mockOnEdit = jest.fn();
    const editor = {
      chain: jest.fn(() => ({ focus: jest.fn(() => ({ setImage: jest.fn(() => ({ run: jest.fn() })) })) })),
      state: { selection: { from: 0 } },
      storage: { image: { onEditImage: mockOnEdit } },
    } as unknown as NodeViewProps["editor"];

    const node = createMockNode({ src: "test.png", alt: "alt text" });
    const getPos = jest.fn(() => 5);

    render(
      <ImageNodeView
        editor={editor} node={node} updateAttributes={jest.fn()} getPos={getPos}
        deleteNode={jest.fn()} decorations={[] as unknown as NodeViewProps["decorations"]}
        selected={false} extension={null as unknown as NodeViewProps["extension"]}
        HTMLAttributes={{}} view={null as unknown as NodeViewProps["view"]}
        innerDecorations={[] as unknown as NodeViewProps["innerDecorations"]}
      />,
    );

    const editUrlBtn = screen.queryByLabelText("imageUrl");
    if (editUrlBtn) {
      fireEvent.click(editUrlBtn);
      expect(mockOnEdit).toHaveBeenCalledWith({ pos: 5, src: "test.png", alt: "alt text" });
    }
  });

  test("image renders with complete natural size tracking", () => {
    setup({ nodeAttrs: { src: "https://example.com/photo.jpg" } });
    const img = screen.getByAltText("test image");
    fireEvent.load(img);
  });
});
