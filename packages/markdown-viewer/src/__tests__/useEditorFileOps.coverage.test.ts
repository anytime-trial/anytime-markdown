/**
 * useEditorFileOps.ts - 追加カバレッジテスト
 * 未カバー行を中心にテスト:
 * - expandCollapsedBlocks / restoreCollapsedBlocks
 * - handleImport 成功パス (readFileAsText mock)
 * - handleSaveFile: onExternalSave / encoding 変換
 * - handleExportPdf メインロジック
 * - handleFileSelected 確認キャンセル
 * - showNotification / notification 管理
 */
import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { useEditorFileOps } from "../hooks/useEditorFileOps";
import { getMarkdownFromEditor } from "../types";

// --- mocks ---

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockConfirm = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({
  __esModule: true,
  default: () => mockConfirm,
}));

jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  getMarkdownFromEditor: jest.fn(),
}));

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: (md: string) => md,
  preserveBlankLines: (md: string) => md,
}));

// readFileAsText を mock して成功パスをテスト可能にする
jest.mock("../utils/fileReading", () => ({
  readFileAsText: jest.fn().mockResolvedValue({ text: "# Mocked File Content", encoding: "UTF-8", lineEnding: "LF" }),
}));

// applyMarkdownToEditor を mock
jest.mock("../utils/editorContentLoader", () => ({
  applyMarkdownToEditor: jest.fn().mockReturnValue({ frontmatter: null, comments: new Map(), body: "" }),
}));

const mockedGetMarkdown = getMarkdownFromEditor as jest.MockedFunction<typeof getMarkdownFromEditor>;
const { readFileAsText } = jest.requireMock("../utils/fileReading") as { readFileAsText: jest.Mock };
const { applyMarkdownToEditor } = jest.requireMock("../utils/editorContentLoader") as { applyMarkdownToEditor: jest.Mock };

// --- helpers ---

function createMockEditor(overrides?: {
  isEmpty?: boolean;
  collapsed?: Array<{ pos: number }>;
  isDestroyed?: boolean;
}): Editor {
  const collapsed = overrides?.collapsed ?? [];
  const mockTr = {
    setNodeAttribute: jest.fn().mockReturnThis(),
  };
  const mockDoc = {
    descendants: jest.fn((cb: (node: { attrs: { collapsed?: boolean } }, pos: number) => void) => {
      for (const c of collapsed) {
        cb({ attrs: { collapsed: true } }, c.pos);
      }
    }),
  };
  return {
    isEmpty: overrides?.isEmpty ?? true,
    isDestroyed: overrides?.isDestroyed ?? false,
    commands: {
      clearContent: jest.fn(),
      setContent: jest.fn(),
      initComments: jest.fn(),
    },
    state: {
      doc: mockDoc,
      tr: mockTr,
    },
    view: {
      dispatch: jest.fn(),
    },
    storage: {
      markdown: {
        parser: { parse: jest.fn((c: string) => c) },
        getMarkdown: jest.fn(() => ""),
      },
    },
  } as unknown as Editor;
}

interface SetupOptions {
  editor?: Editor | null;
  sourceMode?: boolean;
  sourceText?: string;
  openFile?: () => Promise<string | null>;
  saveFile?: (content: string) => Promise<boolean>;
  saveAsFile?: (content: string) => Promise<boolean>;
  resetFile?: () => void;
  encoding?: "UTF-8" | "Shift_JIS" | "EUC-JP";
  fileHandle?: { name: string; nativeHandle?: unknown } | null;
  setFileHandle?: (handle: unknown) => void;
  frontmatter?: string | null;
  onFrontmatterChange?: (value: string | null) => void;
  onExternalSave?: (content: string) => void;
}

function setup(opts: SetupOptions = {}) {
  const editor = opts.editor !== undefined ? opts.editor : createMockEditor();
  const setSourceText = jest.fn();
  const saveContent = jest.fn();
  const downloadMarkdown = jest.fn();
  const clearContent = jest.fn();
  const setFileHandle = opts.setFileHandle ?? jest.fn();

  const hookResult = renderHook(() =>
    useEditorFileOps({
      editor,
      sourceMode: opts.sourceMode ?? false,
      sourceText: opts.sourceText ?? "",
      setSourceText,
      saveContent,
      downloadMarkdown,
      clearContent,
      openFile: opts.openFile,
      saveFile: opts.saveFile,
      saveAsFile: opts.saveAsFile,
      resetFile: opts.resetFile,
      encoding: opts.encoding,
      fileHandle: opts.fileHandle,
      setFileHandle: setFileHandle as (handle: unknown) => void,
      frontmatterRef: { current: opts.frontmatter ?? null },
      onFrontmatterChange: opts.onFrontmatterChange,
      onExternalSave: opts.onExternalSave,
    }),
  );

  return {
    result: hookResult.result,
    editor,
    setSourceText,
    saveContent,
    downloadMarkdown,
    clearContent,
    setFileHandle,
  };
}

// --- tests ---

describe("useEditorFileOps - coverage tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetMarkdown.mockReturnValue("");
    readFileAsText.mockResolvedValue({ text: "# Mocked File Content", encoding: "UTF-8", lineEnding: "LF" });
    applyMarkdownToEditor.mockReturnValue({ frontmatter: null, comments: new Map(), body: "" });
  });

  // ---- handleImport 成功パス ----

  describe("handleImport - 成功パス", () => {
    test("sourceMode: readFileAsText 成功後に setSourceText が呼ばれる", async () => {
      readFileAsText.mockResolvedValue({ text: "# Read Success", encoding: "UTF-8", lineEnding: "LF" });
      const { result, setSourceText } = setup({ sourceMode: true });
      const file = new File(["content"], "test.md", { type: "text/markdown" });

      await act(async () => {
        result.current.handleImport(file);
        // readFileAsText は非同期なので待つ
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(readFileAsText).toHaveBeenCalledWith(file);
      expect(setSourceText).toHaveBeenCalledWith("# Read Success");
    });

    test("WYSIWYG モード: readFileAsText 成功後に applyMarkdownToEditor が呼ばれる", async () => {
      readFileAsText.mockResolvedValue({ text: "# Editor Content", encoding: "UTF-8", lineEnding: "LF" });
      const editor = createMockEditor();
      const onFrontmatterChange = jest.fn();
      const { result } = setup({ editor, sourceMode: false, onFrontmatterChange });
      const file = new File(["content"], "test.md", { type: "text/markdown" });

      await act(async () => {
        result.current.handleImport(file);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(applyMarkdownToEditor).toHaveBeenCalledWith(editor, "# Editor Content");
    });

    test("nativeHandle 付きでインポートすると setFileHandle に nativeHandle が渡る", async () => {
      readFileAsText.mockResolvedValue({ text: "# Handle", encoding: "UTF-8", lineEnding: "LF" });
      const mockNativeHandle = { kind: "file", name: "test.md" };
      const setFileHandle = jest.fn();
      const { result } = setup({ sourceMode: true, setFileHandle });
      const file = new File(["content"], "test.md", { type: "text/markdown" });

      await act(async () => {
        result.current.handleImport(file, mockNativeHandle as unknown as FileSystemFileHandle);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(setFileHandle).toHaveBeenCalledWith({ name: "test.md", nativeHandle: mockNativeHandle });
    });

    test("nativeHandle なしでインポートすると setFileHandle に name のみ渡る", async () => {
      readFileAsText.mockResolvedValue({ text: "# No Handle", encoding: "UTF-8", lineEnding: "LF" });
      const setFileHandle = jest.fn();
      const { result } = setup({ sourceMode: true, setFileHandle });
      const file = new File(["content"], "test.md", { type: "text/markdown" });

      await act(async () => {
        result.current.handleImport(file, undefined);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(setFileHandle).toHaveBeenCalledWith({ name: "test.md" });
    });
  });

  // ---- handleFileSelected 確認キャンセル ----

  describe("handleFileSelected - 確認キャンセル", () => {
    test("sourceMode でコンテンツありの場合、確認キャンセルでインポートしない", async () => {
      mockConfirm.mockRejectedValue(new Error("cancelled"));
      const { result } = setup({ sourceMode: true, sourceText: "existing" });
      const file = new File(["# New"], "test.md", { type: "text/markdown" });

      await act(async () => {
        await result.current.handleFileSelected(file);
      });

      expect(readFileAsText).not.toHaveBeenCalled();
    });
  });

  // ---- handleSaveFile: onExternalSave ----

  describe("handleSaveFile - onExternalSave", () => {
    test("onExternalSave が設定されている場合、それが呼ばれる", async () => {
      const onExternalSave = jest.fn();
      mockedGetMarkdown.mockReturnValue("# External Save");
      const { result } = setup({ onExternalSave });

      await act(async () => {
        await result.current.handleSaveFile();
      });

      expect(onExternalSave).toHaveBeenCalledWith("# External Save\n");
      expect(result.current.notification).toBe("fileSaved");
    });

    test("onExternalSave が saveFile より優先される", async () => {
      const onExternalSave = jest.fn();
      const saveFile = jest.fn().mockResolvedValue(true);
      mockedGetMarkdown.mockReturnValue("# Priority");
      const { result } = setup({ onExternalSave, saveFile });

      await act(async () => {
        await result.current.handleSaveFile();
      });

      expect(onExternalSave).toHaveBeenCalled();
      expect(saveFile).not.toHaveBeenCalled();
    });
  });

  // ---- handleSaveFile: saveFile が false を返す ----

  describe("handleSaveFile - saveFile returns false", () => {
    test("saveFile が false を返した場合、通知を表示しない", async () => {
      const saveFile = jest.fn().mockResolvedValue(false);
      mockedGetMarkdown.mockReturnValue("# Not Saved");
      const { result } = setup({ saveFile });

      await act(async () => {
        await result.current.handleSaveFile();
      });

      expect(saveFile).toHaveBeenCalled();
      expect(result.current.notification).toBeNull();
    });

    test("saveFile が true を返した場合、fileSaved 通知を表示する", async () => {
      const saveFile = jest.fn().mockResolvedValue(true);
      mockedGetMarkdown.mockReturnValue("# Saved");
      const { result } = setup({ saveFile });

      await act(async () => {
        await result.current.handleSaveFile();
      });

      expect(result.current.notification).toBe("fileSaved");
    });
  });

  // ---- handleSaveAsFile: saved=true で通知 ----

  describe("handleSaveAsFile - 通知", () => {
    test("saveAsFile が true を返すと fileSaved 通知", async () => {
      const saveAsFile = jest.fn().mockResolvedValue(true);
      mockedGetMarkdown.mockReturnValue("# SaveAs OK");
      const { result } = setup({ saveAsFile });

      await act(async () => {
        await result.current.handleSaveAsFile();
      });

      expect(result.current.notification).toBe("fileSaved");
    });

    test("saveAsFile が false を返すと通知しない", async () => {
      const saveAsFile = jest.fn().mockResolvedValue(false);
      mockedGetMarkdown.mockReturnValue("# SaveAs Cancel");
      const { result } = setup({ saveAsFile });

      await act(async () => {
        await result.current.handleSaveAsFile();
      });

      expect(result.current.notification).toBeNull();
    });
  });

  // ---- handleExportPdf ----

  describe("handleExportPdf", () => {
    let printSpy: jest.SpyInstance;

    beforeEach(() => {
      printSpy = jest.spyOn(globalThis, "print").mockImplementation(() => {});
    });

    afterEach(() => {
      printSpy.mockRestore();
    });

    test("editor が null の場合 globalThis.print() を直接呼ぶ", async () => {
      const { result } = setup({ editor: null });

      await act(async () => {
        await result.current.handleExportPdf();
      });

      expect(printSpy).toHaveBeenCalled();
    });

    test("editor あり・折りたたみなしの場合、遅延なしで print を呼ぶ", async () => {
      jest.useFakeTimers();
      const editor = createMockEditor();
      const { result } = setup({ editor });

      await act(async () => {
        await result.current.handleExportPdf();
      });

      // delay=0 の setTimeout が実行される
      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(printSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    test("折りたたまれたブロックがある場合、展開→印刷→復元される", async () => {
      jest.useFakeTimers();
      const editor = createMockEditor({ collapsed: [{ pos: 10 }, { pos: 20 }] });
      const { result } = setup({ editor });

      await act(async () => {
        await result.current.handleExportPdf();
      });

      // expandCollapsedBlocks が dispatch を呼ぶ
      expect((editor.view as unknown as { dispatch: jest.Mock }).dispatch).toHaveBeenCalled();

      // 折りたたみありなので PRINT_DELAY 後に print
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(printSpy).toHaveBeenCalled();

      // restoreCollapsedBlocks も dispatch を呼ぶ (2回目)
      expect((editor.view as unknown as { dispatch: jest.Mock }).dispatch).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  // ---- showNotification / notification 管理 ----

  describe("showNotification", () => {
    test("showNotification で notification が設定される", () => {
      const { result } = setup();

      act(() => {
        result.current.showNotification("copiedToClipboard");
      });

      expect(result.current.notification).toBe("copiedToClipboard");
    });

    test("showNotification を連続呼び出しすると最後の値が有効", () => {
      const { result } = setup();

      act(() => {
        result.current.showNotification("copiedToClipboard");
        result.current.showNotification("fileSaved");
      });

      expect(result.current.notification).toBe("fileSaved");
    });

    test("setNotification で直接 null を設定できる", () => {
      const { result } = setup();

      act(() => {
        result.current.showNotification("copiedToClipboard");
      });
      expect(result.current.notification).toBe("copiedToClipboard");

      act(() => {
        result.current.setNotification(null);
      });
      expect(result.current.notification).toBeNull();
    });

    test("showNotification 後に NOTIFICATION_DURATION 経過で null になる", () => {
      jest.useFakeTimers();
      const { result } = setup();

      act(() => {
        result.current.showNotification("pdfExportError");
      });
      expect(result.current.notification).toBe("pdfExportError");

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(result.current.notification).toBeNull();

      jest.useRealTimers();
    });
  });

  // ---- getFullMarkdown: frontmatter 付き ----

  describe("getFullMarkdown (handleDownload 経由)", () => {
    test("frontmatter ありの場合、プリペンドされて downloadMarkdown に渡る", () => {
      mockedGetMarkdown.mockReturnValue("# Body");
      const { result, downloadMarkdown } = setup({ frontmatter: "title: Test" });

      act(() => {
        result.current.handleDownload();
      });

      const calledWith = downloadMarkdown.mock.calls[0][0] as string;
      expect(calledWith).toContain("---");
      expect(calledWith).toContain("title: Test");
      expect(calledWith).toContain("# Body");
    });

    test("末尾に改行がない場合、改行が追加される", () => {
      mockedGetMarkdown.mockReturnValue("no trailing newline");
      const { result, downloadMarkdown } = setup();

      act(() => {
        result.current.handleDownload();
      });

      const calledWith = downloadMarkdown.mock.calls[0][0] as string;
      expect(calledWith.endsWith("\n")).toBe(true);
    });

    test("空文字列の場合、改行は追加されない", () => {
      mockedGetMarkdown.mockReturnValue("");
      const { result, downloadMarkdown } = setup();

      act(() => {
        result.current.handleDownload();
      });

      expect(downloadMarkdown).toHaveBeenCalledWith("", undefined);
    });
  });

  // ---- handleImport: readFileAsText 失敗パス ----

  describe("handleImport - readFileAsText 失敗", () => {
    test("readFileAsText が reject した場合、console.warn のみ", async () => {
      readFileAsText.mockRejectedValue(new Error("read error"));
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { result, setSourceText } = setup({ sourceMode: true });
      const file = new File(["content"], "test.md", { type: "text/markdown" });

      await act(async () => {
        result.current.handleImport(file);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(warnSpy).toHaveBeenCalledWith("Failed to read file:", expect.any(Error));
      expect(setSourceText).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // ---- handleImport: 非対応ファイル ----

  describe("handleImport - 非対応ファイル", () => {
    test(".md でもテキストでもないファイルは readFileAsText を呼ばない", () => {
      const { result } = setup();
      const file = new File(["binary"], "image.png", { type: "image/png" });

      act(() => {
        result.current.handleImport(file);
      });

      expect(readFileAsText).not.toHaveBeenCalled();
    });

    test("text/ タイプのファイルは受け入れる", async () => {
      readFileAsText.mockResolvedValue({ text: "# Text File", encoding: "UTF-8", lineEnding: "LF" });
      const { result, setSourceText } = setup({ sourceMode: true });
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      await act(async () => {
        result.current.handleImport(file);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(readFileAsText).toHaveBeenCalledWith(file);
      expect(setSourceText).toHaveBeenCalledWith("# Text File");
    });
  });

  // ---- onFrontmatterChange コールバック ----

  describe("onFrontmatterChange", () => {
    test("WYSIWYG モードでファイルインポート時に onFrontmatterChange が呼ばれる", async () => {
      readFileAsText.mockResolvedValue({ text: "# With FM", encoding: "UTF-8", lineEnding: "LF" });
      applyMarkdownToEditor.mockReturnValue({ frontmatter: "title: Imported", comments: new Map(), body: "" });
      const onFrontmatterChange = jest.fn();
      const editor = createMockEditor();
      const { result } = setup({ editor, sourceMode: false, onFrontmatterChange });
      const file = new File(["content"], "test.md", { type: "text/markdown" });

      await act(async () => {
        result.current.handleImport(file);
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(onFrontmatterChange).toHaveBeenCalledWith("title: Imported");
    });
  });

  // ---- handleSaveFile: encoding 変換パス (Shift_JIS) ----

  describe("handleSaveFile - encoding conversion", () => {
    test("Shift_JIS + nativeHandle の場合、encoding-japanese で変換して書き込む", async () => {
      const mockWritable = {
        write: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const mockNativeHandle = {
        createWritable: jest.fn().mockResolvedValue(mockWritable),
      };
      mockedGetMarkdown.mockReturnValue("# SJIS Content");

      // encoding-japanese の動的 import を mock
      jest.mock("encoding-japanese", () => ({
        __esModule: true,
        default: {
          stringToCode: jest.fn((s: string) => Array.from(s).map((c) => c.charCodeAt(0))),
          convert: jest.fn((arr: number[]) => arr),
        },
      }));

      const { result } = setup({
        encoding: "Shift_JIS",
        fileHandle: { name: "test.md", nativeHandle: mockNativeHandle },
        saveFile: jest.fn().mockResolvedValue(true),
      });

      await act(async () => {
        await result.current.handleSaveFile();
      });

      expect(mockNativeHandle.createWritable).toHaveBeenCalled();
      expect(mockWritable.write).toHaveBeenCalled();
      expect(mockWritable.close).toHaveBeenCalled();
      expect(result.current.notification).toBe("fileSaved");
    });
  });

  // ---- handleExportPdf: エラー時 ----

  describe("handleExportPdf - エラー処理", () => {
    test("expandCollapsedBlocks で例外が発生した場合、pdfExportError 通知を表示", async () => {
      // state.doc.descendants で例外を投げるエディタ
      const editor = {
        isEmpty: true,
        isDestroyed: false,
        commands: { clearContent: jest.fn(), setContent: jest.fn(), initComments: jest.fn() },
        state: {
          doc: {
            descendants: jest.fn(() => { throw new Error("doc error"); }),
          },
          tr: { setNodeAttribute: jest.fn().mockReturnThis() },
        },
        view: { dispatch: jest.fn() },
        storage: { markdown: { parser: { parse: jest.fn() }, getMarkdown: jest.fn(() => "") } },
      } as unknown as Editor;

      const { result } = setup({ editor });

      await act(async () => {
        await result.current.handleExportPdf();
      });

      expect(result.current.notification).toBe("pdfExportError");
    });
  });
});
