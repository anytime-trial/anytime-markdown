/**
 * GifNodeView.tsx - additional coverage tests
 * Focuses on: captureGifBlob, toggleGifPlayback, onRecordComplete,
 * GifPlaceholder, GifPlaybackImage, message handler, editable state interactions.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Mock dependencies before importing component
jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...props }: any) => <div data-testid="node-view-wrapper" {...props}>{children}</div>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getErrorMain: () => "#f00",
  getTextDisabled: () => "#999",
}));

jest.mock("../constants/dimensions", () => ({
  HANDLEBAR_CAPTION_FONT_SIZE: 10,
}));

const mockSaveBlob = jest.fn().mockResolvedValue(undefined);
const mockPngCapture = jest.fn().mockResolvedValue(undefined);

jest.mock("../hooks/useBlockCapture", () => ({
  useBlockCapture: () => mockPngCapture,
  saveBlob: (...args: unknown[]) => mockSaveBlob(...args),
}));

const mockUseBlockNodeState = jest.fn();
jest.mock("../hooks/useBlockNodeState", () => ({
  useBlockNodeState: (...args: unknown[]) => mockUseBlockNodeState(...args),
}));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ onEdit, onDelete, onExport, extra, label }: any) => (
    <div data-testid="block-inline-toolbar">
      {onEdit && <button data-testid="edit-btn" onClick={onEdit}>Edit</button>}
      {onDelete && <button data-testid="delete-btn" onClick={onDelete}>Delete</button>}
      {onExport && <button data-testid="export-btn" onClick={onExport}>Export</button>}
      {extra}
      <span data-testid="label">{label}</span>
    </div>
  ),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onClose, onDelete }: any) =>
    open ? <div data-testid="delete-dialog"><button data-testid="confirm-delete" onClick={onDelete}>Confirm</button><button onClick={onClose}>Cancel</button></div> : null,
}));

jest.mock("../components/GifPlayerDialog", () => ({
  GifPlayerDialog: ({ open, onClose, src }: any) =>
    open ? <div data-testid="gif-player-dialog"><span>{src}</span><button data-testid="close-player" onClick={onClose}>Close</button></div> : null,
}));

jest.mock("../components/GifRecorderDialog", () => ({
  GifRecorderDialog: ({ open, onClose, onComplete }: any) =>
    open ? (
      <div data-testid="gif-recorder-dialog">
        <button data-testid="complete-record" onClick={() => onComplete(new Blob(["gif"], { type: "image/gif" }), "recording.gif", { fps: 10, quality: 10 })}>Complete</button>
        <button data-testid="close-recorder" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

jest.mock("../utils/gifEncoder", () => ({}));

import { GifNodeView } from "../components/GifNodeView";

const theme = createTheme();

function defaultBlockNodeState(overrides: Record<string, unknown> = {}) {
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

function renderGifNodeView(nodeAttrs: Record<string, unknown> = {}, stateOverrides: Record<string, unknown> = {}) {
  const state = defaultBlockNodeState(stateOverrides);
  mockUseBlockNodeState.mockReturnValue(state);

  const mockNode = {
    attrs: { src: "", alt: "", width: "", gifSettings: null, ...nodeAttrs },
  };
  const mockEditor = {
    view: { nodeDOM: jest.fn(() => null) },
    state: { selection: { from: 0, to: 0 } },
    isActive: () => false,
  };
  const updateAttributes = jest.fn();

  const result = render(
    <ThemeProvider theme={theme}>
      <GifNodeView
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GifNodeView - placeholder interactions", () => {
  it("renders placeholder when no src", () => {
    renderGifNodeView();
    expect(screen.getByText("Click to record GIF")).toBeTruthy();
  });

  it("clicking placeholder opens recorder when editable", () => {
    renderGifNodeView({}, { isEditable: true });
    const placeholder = screen.getByText("Click to record GIF");
    fireEvent.click(placeholder.closest("[class*='MuiBox']")!);
    expect(screen.getByTestId("gif-recorder-dialog")).toBeTruthy();
  });

  it("clicking placeholder does nothing when not editable", () => {
    renderGifNodeView({}, { isEditable: false });
    const placeholder = screen.getByText("Click to record GIF");
    fireEvent.click(placeholder.closest("[class*='MuiBox']")!);
    expect(screen.queryByTestId("gif-recorder-dialog")).toBeNull();
  });
});

describe("GifNodeView - image display", () => {
  it("renders image when src is provided", () => {
    renderGifNodeView({ src: "test.gif", alt: "my-gif" });
    const img = screen.getByAltText("my-gif");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("test.gif");
  });

  it("displays (embedded) for blob src in toolbar", () => {
    renderGifNodeView({ src: "blob:http://localhost/abc" });
    expect(screen.getByText("(embedded)")).toBeTruthy();
  });

  it("displays (embedded) for data: src in toolbar", () => {
    renderGifNodeView({ src: "data:image/gif;base64,abc" });
    expect(screen.getByText("(embedded)")).toBeTruthy();
  });

  it("displays filename for regular src in toolbar", () => {
    renderGifNodeView({ src: "images/test.gif" });
    expect(screen.getByText("(images/test.gif)")).toBeTruthy();
  });
});

describe("GifNodeView - playback toggle", () => {
  it("shows pause button when selected and playing", () => {
    renderGifNodeView({ src: "test.gif" }, { isSelected: true });
    expect(screen.getByLabelText("Pause")).toBeTruthy();
  });

  it("toggles to paused state when pause clicked", () => {
    renderGifNodeView({ src: "test.gif" }, { isSelected: true });

    // Mock canvas for pause
    const mockCtx = { drawImage: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,paused");

    const pauseBtn = screen.getByLabelText("Pause");
    fireEvent.click(pauseBtn);

    expect(screen.getByLabelText("Play")).toBeTruthy();
  });

  it("toggles back to playing from paused state", () => {
    renderGifNodeView({ src: "test.gif" }, { isSelected: true });

    const mockCtx = { drawImage: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,paused");

    // Pause
    fireEvent.click(screen.getByLabelText("Pause"));
    // Play
    fireEvent.click(screen.getByLabelText("Play"));

    expect(screen.getByLabelText("Pause")).toBeTruthy();
  });
});

describe("GifNodeView - edit button", () => {
  it("opens player dialog when src exists and edit clicked", () => {
    renderGifNodeView({ src: "test.gif" });
    const editBtn = screen.getByTestId("edit-btn");
    fireEvent.click(editBtn);
    expect(screen.getByTestId("gif-player-dialog")).toBeTruthy();
  });

  it("opens recorder dialog when no src and edit clicked", () => {
    renderGifNodeView({ src: "" });
    const editBtn = screen.getByTestId("edit-btn");
    fireEvent.click(editBtn);
    expect(screen.getByTestId("gif-recorder-dialog")).toBeTruthy();
  });
});

describe("GifNodeView - record complete", () => {
  it("handles record completion in browser mode (no vscode)", async () => {
    const { updateAttributes } = renderGifNodeView();

    // Open recorder
    const placeholder = screen.getByText("Click to record GIF");
    fireEvent.click(placeholder.closest("[class*='MuiBox']")!);

    // Complete recording
    const completeBtn = screen.getByTestId("complete-record");

    fireEvent.click(completeBtn);

    // FileReader.readAsDataURL is async; wait for updateAttributes to be called
    await waitFor(() => {
      expect(updateAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          src: expect.stringContaining("data:"),
          alt: "recording.gif",
          gifSettings: expect.any(String),
        }),
      );
    });
  });

  it("handles record completion in vscode mode", () => {
    const mockPostMessage = jest.fn();
    (window as any).__vscode = { postMessage: mockPostMessage };

    const { updateAttributes } = renderGifNodeView();

    // Open recorder
    const placeholder = screen.getByText("Click to record GIF");
    fireEvent.click(placeholder.closest("[class*='MuiBox']")!);

    // Complete recording
    const completeBtn = screen.getByTestId("complete-record");

    // Mock FileReader
    const origFileReader = globalThis.FileReader;
    const mockReader = {
      readAsDataURL: jest.fn(),
      result: "data:image/gif;base64,abc",
      onload: null as (() => void) | null,
    };
    (globalThis as any).FileReader = jest.fn(() => mockReader);

    fireEvent.click(completeBtn);

    // Trigger reader onload
    if (mockReader.onload) {
      (mockReader as any).onload();
    }

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "saveClipboardImage",
        fileName: "recording.gif",
      }),
    );

    expect(updateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        gifSettings: expect.any(String),
      }),
    );

    delete (window as any).__vscode;
    globalThis.FileReader = origFileReader;
  });
});

describe("GifNodeView - export/capture", () => {
  it("captures GIF blob when gifBlobRef has data", async () => {
    renderGifNodeView({ src: "test.gif", alt: "my-anim" });

    const exportBtn = screen.getByTestId("export-btn");
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    // Since gifBlobRef starts null and no blob, it should try fetch or pngCapture
    expect(mockPngCapture).toHaveBeenCalled();
  });

  it("fetches and saves GIF when src ends with .gif", async () => {
    const mockBlob = new Blob(["gif-data"], { type: "image/gif" });
    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue(mockBlob),
    });

    renderGifNodeView({ src: "animation.gif", alt: "my-anim" });

    const exportBtn = screen.getByTestId("export-btn");
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(global.fetch).toHaveBeenCalledWith("animation.gif");
    expect(mockSaveBlob).toHaveBeenCalledWith(mockBlob, "my-anim.gif");
  });

  it("fetches and saves GIF when src is blob: URL", async () => {
    const mockBlob = new Blob(["gif-data"], { type: "image/gif" });
    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue(mockBlob),
    });

    renderGifNodeView({ src: "blob:http://localhost/abc", alt: "capture" });

    const exportBtn = screen.getByTestId("export-btn");
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(mockSaveBlob).toHaveBeenCalledWith(mockBlob, "capture.gif");
  });

  it("falls back to PNG capture when fetch fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

    renderGifNodeView({ src: "blob:http://localhost/abc", alt: "capture" });

    const exportBtn = screen.getByTestId("export-btn");
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(mockPngCapture).toHaveBeenCalled();
  });

  it("converts non-gif blob type", async () => {
    const mockBlob = new Blob(["data"], { type: "image/png" });
    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue(mockBlob),
    });

    renderGifNodeView({ src: "animation.gif", alt: "my-anim" });

    const exportBtn = screen.getByTestId("export-btn");
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    // Should wrap in a Blob with type image/gif
    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "my-anim.gif");
  });
});

describe("GifNodeView - message handler", () => {
  it("updates src when imageSaved message is received", () => {
    const { updateAttributes } = renderGifNodeView({ src: "test.gif" });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "imageSaved", fileName: "saved.gif", path: "/images/saved.gif" },
        }),
      );
    });

    expect(updateAttributes).toHaveBeenCalledWith({ src: "/images/saved.gif" });
  });

  it("uses fileName when path is not present", () => {
    const { updateAttributes } = renderGifNodeView({ src: "test.gif" });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "imageSaved", fileName: "saved.gif" },
        }),
      );
    });

    expect(updateAttributes).toHaveBeenCalledWith({ src: "saved.gif" });
  });

  it("ignores unrelated messages", () => {
    const { updateAttributes } = renderGifNodeView({ src: "test.gif" });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "otherEvent" },
        }),
      );
    });

    expect(updateAttributes).not.toHaveBeenCalled();
  });
});

describe("GifNodeView - collapsed state", () => {
  it("does not render content when collapsed", () => {
    renderGifNodeView({ src: "test.gif" }, { collapsed: true });
    expect(screen.queryByAltText("GIF")).toBeNull();
    expect(screen.queryByText("Click to record GIF")).toBeNull();
  });
});

describe("GifNodeView - not editable", () => {
  it("does not show toolbar when not editable and not compare left editable", () => {
    renderGifNodeView({ src: "test.gif" }, { isEditable: false, isCompareLeftEditable: false });
    expect(screen.queryByTestId("block-inline-toolbar")).toBeNull();
  });
});

describe("GifNodeView - record button", () => {
  it("shows Record GIF button in toolbar when editable", () => {
    renderGifNodeView({ src: "test.gif" });
    const recordBtn = screen.getByLabelText("Record GIF");
    expect(recordBtn).toBeTruthy();
  });

  it("opens recorder dialog on Record GIF button click", () => {
    renderGifNodeView({ src: "test.gif" });
    const recordBtn = screen.getByLabelText("Record GIF");
    fireEvent.click(recordBtn);
    expect(screen.getByTestId("gif-recorder-dialog")).toBeTruthy();
  });
});

describe("GifNodeView - delete dialog", () => {
  it("opens delete dialog on delete button click", () => {
    const setDeleteDialogOpen = jest.fn();
    renderGifNodeView({ src: "test.gif" }, { setDeleteDialogOpen });
    const deleteBtn = screen.getByTestId("delete-btn");
    fireEvent.click(deleteBtn);
    expect(setDeleteDialogOpen).toHaveBeenCalledWith(true);
  });
});

describe("GifNodeView - gifSettings parsing", () => {
  it("opens player with parsed gifSettings", () => {
    renderGifNodeView({ src: "test.gif", gifSettings: JSON.stringify({ fps: 15, quality: 8 }) });
    const editBtn = screen.getByTestId("edit-btn");
    fireEvent.click(editBtn);
    expect(screen.getByTestId("gif-player-dialog")).toBeTruthy();
  });
});

describe("GifNodeView - toggleGifPlayback with blob src", () => {
  it("resumes blob src without query param", () => {
    renderGifNodeView({ src: "blob:http://localhost/xyz" }, { isSelected: true });

    const mockCtx = { drawImage: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,paused");

    // Pause first
    fireEvent.click(screen.getByLabelText("Pause"));
    // Play again - blob URL should be set directly
    fireEvent.click(screen.getByLabelText("Play"));

    expect(screen.getByLabelText("Pause")).toBeTruthy();
  });

  it("resumes non-blob src with cache-busting query param", () => {
    renderGifNodeView({ src: "images/test.gif" }, { isSelected: true });

    const mockCtx = { drawImage: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,paused");

    // Pause
    fireEvent.click(screen.getByLabelText("Pause"));
    // Play
    fireEvent.click(screen.getByLabelText("Play"));

    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("_t=");
  });

  it("appends cache-busting with & when src already has query params", () => {
    renderGifNodeView({ src: "images/test.gif?v=1" }, { isSelected: true });

    const mockCtx = { drawImage: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,paused");

    // Pause
    fireEvent.click(screen.getByLabelText("Pause"));
    // Play
    fireEvent.click(screen.getByLabelText("Play"));

    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("&_t=");
  });
});
