/**
 * useEditorDialogs.ts - 追加カバレッジテスト (lines 32-35, 113-121)
 * ImageNodeView edit handler, handleImageInsert with imageEditPos
 */
import { renderHook, act } from "@testing-library/react";
import { useEditorDialogs } from "../hooks/useEditorDialogs";

jest.mock("../types", () => ({
  getEditorStorage: (editor: any) => {
    if (!editor._storage) editor._storage = { image: {}, commentDialog: {}, linkDialog: {} };
    return editor._storage;
  },
}));

function createMockEditor() {
  return {
    _storage: { image: { onEditImage: null }, commentDialog: { open: null }, linkDialog: { open: null } },
    isActive: jest.fn().mockReturnValue(false),
    chain: jest.fn().mockReturnValue({
      focus: jest.fn().mockReturnValue({
        unsetLink: jest.fn().mockReturnValue({ run: jest.fn() }),
        extendMarkRange: jest.fn().mockReturnValue({
          setLink: jest.fn().mockReturnValue({ run: jest.fn() }),
        }),
        setImage: jest.fn().mockReturnValue({ run: jest.fn() }),
        addComment: jest.fn().mockReturnValue({ run: jest.fn() }),
      }),
    }),
    state: {
      tr: {
        doc: {
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "image" },
            attrs: { src: "old.png", alt: "old" },
          }),
        },
        setNodeMarkup: jest.fn(),
      },
    },
    view: { dispatch: jest.fn() },
    commands: { setContent: jest.fn() },
  } as any;
}

describe("useEditorDialogs coverage", () => {
  it("onEditImage callback opens image dialog with edit data (lines 32-35)", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    // Trigger the onEditImage callback
    act(() => {
      editor._storage.image.onEditImage({ pos: 42, src: "test.png", alt: "Test Alt" });
    });

    expect(result.current.imageDialogOpen).toBe(true);
    expect(result.current.imageUrl).toBe("test.png");
    expect(result.current.imageAlt).toBe("Test Alt");
    expect(result.current.imageEditPos).toBe(42);
  });

  it("handleImageInsert with imageEditPos updates existing node (lines 113-121)", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    // Set up image edit state
    act(() => {
      editor._storage.image.onEditImage({ pos: 10, src: "old.png", alt: "old" });
    });

    // Change the URL
    act(() => {
      result.current.setImageUrl("new.png");
      result.current.setImageAlt("new alt");
    });

    // Insert (should update existing node)
    act(() => {
      result.current.handleImageInsert();
    });

    expect(editor.state.tr.setNodeMarkup).toHaveBeenCalledWith(
      10,
      undefined,
      expect.objectContaining({ src: "new.png", alt: "new alt" }),
    );
    expect(result.current.imageDialogOpen).toBe(false);
    expect(result.current.imageEditPos).toBeNull();
  });

  it("handleImageInsert in source mode appends markdown", () => {
    const appendToSource = jest.fn();
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: true, appendToSource }),
    );

    act(() => { result.current.handleImage(); });
    act(() => {
      result.current.setImageUrl("img.png");
      result.current.setImageAlt("alt text");
    });
    act(() => { result.current.handleImageInsert(); });

    expect(appendToSource).toHaveBeenCalledWith("![alt text](img.png)");
  });

  it("handleImageInsert with empty URL does nothing", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    act(() => { result.current.handleImage(); });
    // URL is empty
    act(() => { result.current.handleImageInsert(); });
    // Dialog should still be open since URL was empty
    expect(result.current.imageDialogOpen).toBe(true);
  });

  it("handleImageInsert inserts new image when imageEditPos is null", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    act(() => { result.current.handleImage(); });
    act(() => { result.current.setImageUrl("new.png"); });
    act(() => { result.current.handleImageInsert(); });

    expect(result.current.imageDialogOpen).toBe(false);
  });

  it("handleLink toggles off existing link", () => {
    const editor = createMockEditor();
    editor.isActive.mockReturnValue(true);
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    act(() => { result.current.handleLink(); });
    // Should not open dialog, should unset link
    expect(result.current.linkDialogOpen).toBe(false);
  });

  it("handleCommentInsert with empty text does nothing", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    act(() => { result.current.handleCommentOpen(); });
    // commentText is empty
    act(() => { result.current.handleCommentInsert(); });
    // Dialog should still be open
    expect(result.current.commentDialogOpen).toBe(true);
  });

  it("handleCommentInsert with text adds comment and closes", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    act(() => { result.current.handleCommentOpen(); });
    act(() => { result.current.setCommentText("My comment"); });
    act(() => { result.current.handleCommentInsert(); });

    expect(result.current.commentDialogOpen).toBe(false);
  });

  it("handleImage does nothing when editor is null and not sourceMode", () => {
    const { result } = renderHook(() =>
      useEditorDialogs({ editor: null, sourceMode: false, appendToSource: jest.fn() }),
    );

    act(() => { result.current.handleImage(); });
    expect(result.current.imageDialogOpen).toBe(false);
  });

  it("cleanup removes onEditImage handler", () => {
    const editor = createMockEditor();
    const { unmount } = renderHook(() =>
      useEditorDialogs({ editor, sourceMode: false, appendToSource: jest.fn() }),
    );

    unmount();
    expect(editor._storage.image.onEditImage).toBeNull();
  });
});
