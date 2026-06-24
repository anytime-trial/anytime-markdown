/**
 * installBlockOverlays.ts — G3 / G2残: gif/image/table の DialogHost 3 を vanilla 配線した installer。
 *
 * block chrome（gif/image/table）と vanilla ダイアログ群は個別テスト済みのため、本テストは
 * **installer の配線ロジック**（intent→ダイアログ生成 / VS Code 保存フロー / 削除確認 / table 委譲 /
 * destroy）に絞る。chrome / ダイアログ各モジュールは mock して渡されたコールバックを直接駆動する。
 */

import type { GifBlockChromeCallbacks } from "../chrome/gifBlockChrome";
import type { ImageBlockChromeCallbacks } from "../chrome/imageBlockChrome";
import type { TableBlockChromeCallbacks } from "../chrome/tableBlockChrome";

// --- block chrome の mock（渡された intent コールバックを捕捉） -------------------------
let mockGifCb: GifBlockChromeCallbacks | undefined;
let mockImageCb: ImageBlockChromeCallbacks | undefined;
let mockTableCb: TableBlockChromeCallbacks | undefined;
const mockGifDestroy = jest.fn();
const mockImageDestroy = jest.fn();
const mockTableHandle = { setEditing: jest.fn(), destroy: jest.fn() };

jest.mock("../chrome/gifBlockChrome", () => ({
  createGifBlockChrome: jest.fn((_editor: unknown, cb: GifBlockChromeCallbacks) => {
    mockGifCb = cb;
    return mockGifDestroy;
  }),
}));
jest.mock("../chrome/imageBlockChrome", () => ({
  createImageBlockChrome: jest.fn((_editor: unknown, cb: ImageBlockChromeCallbacks) => {
    mockImageCb = cb;
    return mockImageDestroy;
  }),
}));
jest.mock("../chrome/tableBlockChrome", () => ({
  createTableBlockChrome: jest.fn((_editor: unknown, cb: TableBlockChromeCallbacks) => {
    mockTableCb = cb;
    return mockTableHandle;
  }),
}));

// --- blockChrome の永続化ヘルパ mock -------------------------------------------------
const mockSetBlockAttrs = jest.fn();
const mockDeleteBlockAt = jest.fn();
jest.mock("../chrome/blockChrome", () => ({
  setBlockAttrs: (...args: unknown[]) => mockSetBlockAttrs(...args),
  deleteBlockAt: (...args: unknown[]) => mockDeleteBlockAt(...args),
}));

// --- vanilla ダイアログ mock（生成捕捉 + コールバック駆動用に opts 保持） ----------------
const mockPlayer = jest.fn();
const mockRecorderOpts: { onComplete?: (b: Blob, f: string, s: unknown) => void } = {};
const mockRecorderDestroy = jest.fn();
const mockCropOpts: { onCrop?: (d: string) => void } = {};
const mockAnnotationOpts: { onSave?: (items: unknown[]) => void } = {};
const mockCapture = jest.fn();
jest.mock("../components-vanilla/GifPlayerDialog", () => ({
  createGifPlayerDialog: jest.fn((opts: unknown) => {
    mockPlayer(opts);
    return { el: document.createElement("div"), destroy: jest.fn() };
  }),
}));
jest.mock("../components-vanilla/GifRecorderDialog", () => ({
  createGifRecorderDialog: jest.fn((opts: { onComplete: (b: Blob, f: string, s: unknown) => void }) => {
    mockRecorderOpts.onComplete = opts.onComplete;
    return { el: document.createElement("div"), destroy: mockRecorderDestroy };
  }),
}));
jest.mock("../components-vanilla/ImageCropTool", () => ({
  createImageCropTool: jest.fn((opts: { onCrop: (d: string) => void }) => {
    mockCropOpts.onCrop = opts.onCrop;
    return { el: document.createElement("div"), destroy: jest.fn() };
  }),
}));
jest.mock("../components-vanilla/ImageAnnotationDialog", () => ({
  createImageAnnotationDialog: jest.fn((opts: { onSave: (items: unknown[]) => void }) => {
    mockAnnotationOpts.onSave = opts.onSave;
    return { el: document.createElement("div"), destroy: jest.fn() };
  }),
}));
jest.mock("../components-vanilla/ScreenCaptureDialog", () => ({
  createScreenCaptureDialog: jest.fn((opts: unknown) => {
    mockCapture(opts);
    return { el: document.createElement("div"), destroy: jest.fn() };
  }),
}));
const mockOpenImage = jest.fn();
const mockEditorDialogsOpts: { onImageInsert?: (url: string, alt: string) => void } = {};
jest.mock("../components-vanilla/EditorDialogs", () => ({
  createEditorDialogs: jest.fn((opts: { onImageInsert: (url: string, alt: string) => void }) => {
    mockEditorDialogsOpts.onImageInsert = opts.onImageInsert;
    return { openImage: mockOpenImage, destroy: jest.fn() };
  }),
}));

import { installBlockOverlays } from "../chrome/installBlockOverlays";
import type { Editor } from "@anytime-markdown/markdown-core";

/** FileReader.onload（jsdom 非同期）を確実に排出するため複数マクロタスク待つ。 */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
};
const t = (k: string): string => k;

function makeEditor(): { editor: Editor; imageStorage: { onEditImage?: unknown } } {
  const imageStorage: { onEditImage?: unknown } = {};
  const editor = { storage: { image: imageStorage } } as unknown as Editor;
  return { editor, imageStorage };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGifCb = mockImageCb = mockTableCb = undefined;
  mockRecorderOpts.onComplete = undefined;
  mockCropOpts.onCrop = undefined;
  mockAnnotationOpts.onSave = undefined;
  mockEditorDialogsOpts.onImageInsert = undefined;
});

describe("installBlockOverlays — gif", () => {
  it("onEdit に src があれば player ダイアログ、無ければ recorder を開く", () => {
    const { editor } = makeEditor();
    installBlockOverlays(editor, { t, vscodeApi: null });
    mockGifCb!.onEdit(3, { src: "blob:x", settings: '{"fps":10,"width":800,"duration":2}' });
    expect(mockPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayer.mock.calls[0][0]).toMatchObject({
      src: "blob:x",
      settings: { fps: 10, width: 800, duration: 2 },
    });

    mockGifCb!.onEdit(5, { src: "", settings: null });
    expect(mockRecorderOpts.onComplete).toBeDefined();
  });

  it("onRecord で recorder を開き、web 経路の録画完了で setBlockAttrs(src/alt/gifSettings)", async () => {
    const { editor } = makeEditor();
    installBlockOverlays(editor, { t, vscodeApi: null });
    mockGifCb!.onRecord(7);
    const settings = { fps: 10, width: 800, duration: 2 };
    mockRecorderOpts.onComplete!(new Blob(["gif"], { type: "image/gif" }), "rec.gif", settings);
    await flush();
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(
      editor,
      7,
      expect.objectContaining({ alt: "rec.gif", gifSettings: JSON.stringify(settings) }),
    );
  });

  it("VS Code 経路: saveClipboardImage を postMessage し imageSaved で src を確定", async () => {
    const { editor } = makeEditor();
    const postMessage = jest.fn();
    const vscodeApi = { postMessage, getState: jest.fn(), setState: jest.fn() } as unknown as VsCodeApi;
    installBlockOverlays(editor, { t, vscodeApi });
    mockGifCb!.onRecord(9);
    const settings = { fps: 10, width: 800, duration: 2 };
    mockRecorderOpts.onComplete!(new Blob(["gif"], { type: "image/gif" }), "rec.gif", settings);
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = postMessage.mock.calls[0][0];
    expect(msg.type).toBe("saveClipboardImage");
    expect(typeof msg.requestId).toBe("string");
    // 録画直後は gifSettings のみ確定（src は imageSaved で後追い）。
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(editor, 9, {
      gifSettings: JSON.stringify(settings),
    });

    mockSetBlockAttrs.mockClear();
    globalThis.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "imageSaved", requestId: msg.requestId, path: "/img/rec.gif" },
      }),
    );
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(editor, 9, { src: "/img/rec.gif" });
  });
});

describe("installBlockOverlays — gif 堅牢性", () => {
  it("不正な gifSettings JSON でも throw せず settings 無しで player を開く", () => {
    const { editor } = makeEditor();
    installBlockOverlays(editor, { t, vscodeApi: null });
    expect(() => mockGifCb!.onEdit(1, { src: "blob:x", settings: "{bad json" })).not.toThrow();
    expect(mockPlayer.mock.calls[0][0]).toMatchObject({ src: "blob:x", settings: undefined });
  });

  it("destroy で in-flight の録画 FileReader を abort し遅延 setBlockAttrs を防ぐ", async () => {
    const { editor } = makeEditor();
    const handle = installBlockOverlays(editor, { t, vscodeApi: null });
    mockGifCb!.onRecord(7);
    mockRecorderOpts.onComplete!(new Blob(["gif"], { type: "image/gif" }), "rec.gif", {
      fps: 10,
      width: 800,
      duration: 2,
    });
    handle.destroy(); // onload 発火前に破棄 → abort
    await flush();
    expect(mockSetBlockAttrs).not.toHaveBeenCalledWith(
      editor,
      7,
      expect.objectContaining({ src: expect.anything() }),
    );
  });
});

describe("installBlockOverlays — image", () => {
  it("crop 完了は web 経路で setBlockAttrs(src=dataUrl)", () => {
    const { editor } = makeEditor();
    installBlockOverlays(editor, { t, vscodeApi: null });
    mockImageCb!.onEditCrop(2, { src: "https://x/y.png" });
    expect(mockCropOpts.onCrop).toBeDefined();
    mockCropOpts.onCrop!("data:image/png;base64,AAA");
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(editor, 2, { src: "data:image/png;base64,AAA" });
  });

  it("crop 完了は VS Code 経路（非 data src）で overwriteImage + cache-bust", () => {
    const { editor } = makeEditor();
    const postMessage = jest.fn();
    const vscodeApi = { postMessage, getState: jest.fn(), setState: jest.fn() } as unknown as VsCodeApi;
    installBlockOverlays(editor, { t, vscodeApi });
    mockImageCb!.onEditCrop(4, { src: "https://x/y.png" });
    mockCropOpts.onCrop!("data:image/png;base64,BBB");
    expect(postMessage).toHaveBeenCalledWith({
      type: "overwriteImage",
      path: "https://x/y.png",
      dataUrl: "data:image/png;base64,BBB",
    });
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(
      editor,
      4,
      expect.objectContaining({ src: expect.stringContaining("https://x/y.png?t=") }),
    );
  });

  it("crop 編集画面は他の編集画面と同じく全画面（fullScreen）で開く", () => {
    const { editor } = makeEditor();
    const handle = installBlockOverlays(editor, { t, vscodeApi: null });
    mockImageCb!.onEditCrop(2, { src: "https://x/y.png" });

    const papers = document.querySelectorAll('[data-am-dialog-backdrop] [role="dialog"]');
    const paper = papers[papers.length - 1] as HTMLElement | undefined;
    if (!paper) throw new Error("crop ダイアログの paper が見つからない");
    // fullScreen の paper は width/height/max-width/max-height が 100%（旧 maxWidth:md, fullWidth:true は非該当）。
    expect(paper.style.width).toBe("100%");
    expect(paper.style.height).toBe("100%");
    expect(paper.style.maxWidth).toBe("100%");
    expect(paper.style.maxHeight).toBe("100%");
    handle.destroy();
  });

  it("annotate 保存で serialize した annotations を setBlockAttrs", () => {
    const { editor } = makeEditor();
    installBlockOverlays(editor, { t, vscodeApi: null });
    mockImageCb!.onAnnotate(6, { src: "https://x/y.png", annotations: null });
    expect(mockAnnotationOpts.onSave).toBeDefined();
    mockAnnotationOpts.onSave!([
      { id: "a", type: "rect", x1: 0, y1: 0, x2: 1, y2: 1, color: "#f00", comment: "" },
    ]);
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(
      editor,
      6,
      expect.objectContaining({ annotations: expect.any(String) }),
    );
  });

  it("URL 編集は editor.storage.image.onEditImage 経由で編集ダイアログを開き setBlockAttrs", () => {
    const { editor, imageStorage } = makeEditor();
    installBlockOverlays(editor, { t, vscodeApi: null });
    expect(typeof imageStorage.onEditImage).toBe("function");
    (imageStorage.onEditImage as (d: { pos: number; src: string; alt: string }) => void)({
      pos: 8,
      src: "https://x/y.png",
      alt: "alt",
    });
    expect(mockOpenImage).toHaveBeenCalledWith("https://x/y.png", "alt");
    mockEditorDialogsOpts.onImageInsert!("https://x/z.png", "newalt");
    expect(mockSetBlockAttrs).toHaveBeenCalledWith(editor, 8, {
      src: "https://x/z.png",
      alt: "newalt",
    });
  });
});

describe("installBlockOverlays — 削除確認", () => {
  it("confirm が true を返すと deleteBlockAt、false なら呼ばない", async () => {
    const { editor } = makeEditor();
    const confirmYes = jest.fn().mockResolvedValue(true);
    installBlockOverlays(editor, { t, vscodeApi: null, confirm: confirmYes });
    mockImageCb!.onDelete(10);
    await flush();
    expect(confirmYes).toHaveBeenCalled();
    expect(mockDeleteBlockAt).toHaveBeenCalledWith(editor, 10);

    mockDeleteBlockAt.mockClear();
    const { editor: editor2 } = makeEditor();
    const confirmNo = jest.fn().mockResolvedValue(false);
    installBlockOverlays(editor2, { t, vscodeApi: null, confirm: confirmNo });
    mockGifCb!.onDelete(11);
    await flush();
    expect(mockDeleteBlockAt).not.toHaveBeenCalled();
  });
});

describe("installBlockOverlays — table", () => {
  it("onTableEdit 指定時は setEditing(true) + 委譲、未指定時は onEdit 自体を渡さない（ボタン非表示）", () => {
    const { editor } = makeEditor();
    const onTableEdit = jest.fn();
    installBlockOverlays(editor, { t, vscodeApi: null, onTableEdit });
    mockTableCb!.onEdit?.(12);
    expect(mockTableHandle.setEditing).toHaveBeenCalledWith(true);
    expect(onTableEdit).toHaveBeenCalledWith(
      expect.objectContaining({ pos: 12, setEditing: expect.any(Function) }),
    );

    mockTableHandle.setEditing.mockClear();
    onTableEdit.mockClear();
    const { editor: editor2 } = makeEditor();
    installBlockOverlays(editor2, { t, vscodeApi: null });
    // 未提供時は chrome に onEdit を渡さない = 編集ボタンが描画されない
    expect(mockTableCb!.onEdit).toBeUndefined();
    expect(mockTableHandle.setEditing).not.toHaveBeenCalled();
  });
});

describe("installBlockOverlays — destroy", () => {
  it("全 chrome の destroy/handle を破棄し storage.onEditImage を復元する", () => {
    const { editor, imageStorage } = makeEditor();
    const handle = installBlockOverlays(editor, { t, vscodeApi: null });
    expect(typeof imageStorage.onEditImage).toBe("function");
    handle.destroy();
    expect(mockGifDestroy).toHaveBeenCalled();
    expect(mockImageDestroy).toHaveBeenCalled();
    expect(mockTableHandle.destroy).toHaveBeenCalled();
    expect(imageStorage.onEditImage).toBeUndefined();
  });
});
