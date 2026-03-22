/**
 * useEditorDialogs のユニットテスト
 *
 * リンク・画像・コメント・ショートカットダイアログの状態管理を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useEditorDialogs } from "../hooks/useEditorDialogs";

// getEditorStorage モック
jest.mock("../types", () => ({
  getEditorStorage: jest.fn().mockReturnValue({
    image: { onEditImage: null },
    commentDialog: { open: null },
    linkDialog: { open: null },
  }),
}));

function createMockEditor(overrides: Record<string, any> = {}) {
  const runFn = jest.fn();
  const chainObj: Record<string, jest.Mock> = {
    focus: jest.fn().mockReturnThis(),
    unsetLink: jest.fn().mockReturnThis(),
    extendMarkRange: jest.fn().mockReturnThis(),
    setLink: jest.fn().mockReturnThis(),
    setImage: jest.fn().mockReturnThis(),
    addComment: jest.fn().mockReturnThis(),
    run: runFn,
  };

  return {
    isActive: jest.fn().mockReturnValue(false),
    chain: jest.fn().mockReturnValue(chainObj),
    state: {
      tr: { doc: { nodeAt: jest.fn() }, setNodeMarkup: jest.fn() },
      selection: { from: 0 },
    },
    view: { dispatch: jest.fn() },
    storage: {},
    ...overrides,
    _chain: chainObj,
    _run: runFn,
  };
}

describe("useEditorDialogs", () => {
  const defaultParams = () => ({
    editor: null as any,
    sourceMode: false,
    appendToSource: jest.fn(),
  });

  describe("リンクダイアログ", () => {
    it("handleLink でダイアログを開く", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.handleLink();
      });

      expect(result.current.linkDialogOpen).toBe(true);
      expect(result.current.linkUrl).toBe("");
    });

    it("リンクがアクティブなら unsetLink する", () => {
      const editor = createMockEditor();
      editor.isActive.mockReturnValue(true);

      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.handleLink();
      });

      expect(result.current.linkDialogOpen).toBe(false);
      expect(editor._chain.unsetLink).toHaveBeenCalled();
    });

    it("handleLinkInsert でリンクを挿入する", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.setLinkUrl("https://example.com");
      });

      act(() => {
        result.current.handleLinkInsert();
      });

      expect(editor._chain.setLink).toHaveBeenCalledWith({ href: "https://example.com" });
      expect(result.current.linkDialogOpen).toBe(false);
    });

    it("空の URL ではリンクを挿入しない", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.setLinkUrl("   ");
      });

      act(() => {
        result.current.handleLinkInsert();
      });

      expect(editor._chain.setLink).not.toHaveBeenCalled();
    });

    it("editor が null なら handleLinkInsert は何もしない", () => {
      const { result } = renderHook(() =>
        useEditorDialogs(defaultParams()),
      );

      act(() => {
        result.current.setLinkUrl("https://example.com");
      });

      // エラーなく実行されること
      act(() => {
        result.current.handleLinkInsert();
      });
    });
  });

  describe("画像ダイアログ", () => {
    it("handleImage でダイアログを開く", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.handleImage();
      });

      expect(result.current.imageDialogOpen).toBe(true);
      expect(result.current.imageUrl).toBe("");
      expect(result.current.imageAlt).toBe("");
    });

    it("handleImageInsert で画像を挿入する", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.setImageUrl("https://example.com/img.png");
        result.current.setImageAlt("Test image");
      });

      act(() => {
        result.current.handleImageInsert();
      });

      expect(editor._chain.setImage).toHaveBeenCalledWith({
        src: "https://example.com/img.png",
        alt: "Test image",
      });
      expect(result.current.imageDialogOpen).toBe(false);
    });

    it("空の URL では画像を挿入しない", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.setImageUrl("  ");
      });

      act(() => {
        result.current.handleImageInsert();
      });

      expect(editor._chain.setImage).not.toHaveBeenCalled();
    });

    it("sourceMode で画像を挿入するとマークダウンが appendToSource される", () => {
      const appendToSource = jest.fn();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), sourceMode: true, appendToSource }),
      );

      act(() => {
        result.current.setImageUrl("https://example.com/img.png");
        result.current.setImageAlt("My Alt");
      });

      act(() => {
        result.current.handleImageInsert();
      });

      expect(appendToSource).toHaveBeenCalledWith("![My Alt](https://example.com/img.png)");
      expect(result.current.imageDialogOpen).toBe(false);
    });

    it("sourceMode で alt が空の場合は 'image' がデフォルト", () => {
      const appendToSource = jest.fn();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), sourceMode: true, appendToSource }),
      );

      act(() => {
        result.current.setImageUrl("https://example.com/img.png");
      });

      act(() => {
        result.current.handleImageInsert();
      });

      expect(appendToSource).toHaveBeenCalledWith("![image](https://example.com/img.png)");
    });

    it("editor も sourceMode もない場合 handleImage は何もしない", () => {
      const { result } = renderHook(() =>
        useEditorDialogs(defaultParams()),
      );

      act(() => {
        result.current.handleImage();
      });

      expect(result.current.imageDialogOpen).toBe(false);
    });
  });

  describe("コメントダイアログ", () => {
    it("handleCommentOpen でダイアログを開く", () => {
      const { result } = renderHook(() =>
        useEditorDialogs(defaultParams()),
      );

      act(() => {
        result.current.handleCommentOpen();
      });

      expect(result.current.commentDialogOpen).toBe(true);
      expect(result.current.commentText).toBe("");
    });

    it("handleCommentInsert でコメントを挿入する", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.setCommentText("Test comment");
      });

      act(() => {
        result.current.handleCommentInsert();
      });

      expect(editor._chain.addComment).toHaveBeenCalledWith("Test comment");
      expect(result.current.commentDialogOpen).toBe(false);
    });

    it("空のコメントでは挿入しない", () => {
      const editor = createMockEditor();
      const { result } = renderHook(() =>
        useEditorDialogs({ ...defaultParams(), editor: editor as any }),
      );

      act(() => {
        result.current.setCommentText("   ");
      });

      act(() => {
        result.current.handleCommentInsert();
      });

      expect(editor._chain.addComment).not.toHaveBeenCalled();
    });
  });

  describe("ショートカット・バージョンダイアログ", () => {
    it("shortcutDialogOpen を制御できる", () => {
      const { result } = renderHook(() =>
        useEditorDialogs(defaultParams()),
      );

      expect(result.current.shortcutDialogOpen).toBe(false);

      act(() => {
        result.current.setShortcutDialogOpen(true);
      });

      expect(result.current.shortcutDialogOpen).toBe(true);
    });

    it("versionDialogOpen を制御できる", () => {
      const { result } = renderHook(() =>
        useEditorDialogs(defaultParams()),
      );

      expect(result.current.versionDialogOpen).toBe(false);

      act(() => {
        result.current.setVersionDialogOpen(true);
      });

      expect(result.current.versionDialogOpen).toBe(true);
    });
  });
});
