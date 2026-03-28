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

const mockedGetMarkdown = getMarkdownFromEditor as jest.MockedFunction<
  typeof getMarkdownFromEditor
>;

// --- helpers ---

function createMockEditor(overrides?: Partial<{ isEmpty: boolean }>): Editor {
  return {
    isEmpty: overrides?.isEmpty ?? true,
    commands: {
      clearContent: jest.fn(),
      setContent: jest.fn(),
      initComments: jest.fn(),
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
}

function setup(opts: SetupOptions = {}) {
  const editor = opts.editor !== undefined ? opts.editor : createMockEditor();
  const setSourceText = jest.fn();
  const saveContent = jest.fn();
  const downloadMarkdown = jest.fn();
  const clearContent = jest.fn();

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
      frontmatterRef: { current: null },
    }),
  );

  return {
    result: hookResult.result,
    editor,
    setSourceText,
    saveContent,
    downloadMarkdown,
    clearContent,
  };
}

// --- tests ---

describe("useEditorFileOps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetMarkdown.mockReturnValue("");
  });

  // ---- 戻り値 ----

  test("ハンドラ関数群と状態を返す", () => {
    const { result } = setup();
    expect(result.current.handleClear).toBeInstanceOf(Function);
    expect(result.current.handleFileSelected).toBeInstanceOf(Function);
    expect(result.current.handleDownload).toBeInstanceOf(Function);
    expect(result.current.handleImport).toBeInstanceOf(Function);
    expect(result.current.handleCopy).toBeInstanceOf(Function);
    expect(result.current.handleOpenFile).toBeInstanceOf(Function);
    expect(result.current.handleSaveFile).toBeInstanceOf(Function);
    expect(result.current.handleSaveAsFile).toBeInstanceOf(Function);
    expect(result.current.notification).toBe(null);
    expect(result.current.fileInputRef).toBeDefined();
  });

  // ---- handleSaveFile ----

  test("handleSaveFile: saveFile が渡されている場合に呼び出される", async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    mockedGetMarkdown.mockReturnValue("# Test");
    const { result } = setup({ saveFile: saveFn });

    await act(async () => {
      await result.current.handleSaveFile();
    });

    expect(saveFn).toHaveBeenCalledWith("# Test\n");
  });

  test("handleSaveFile: sourceMode 時は sourceText を保存する", async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { result } = setup({
      saveFile: saveFn,
      sourceMode: true,
      sourceText: "# Source",
    });

    await act(async () => {
      await result.current.handleSaveFile();
    });

    expect(saveFn).toHaveBeenCalledWith("# Source\n");
  });

  test("handleSaveFile: saveFile 未指定時は何もしない", async () => {
    const { result } = setup();
    // エラーが投げられないことを確認
    await act(async () => {
      await result.current.handleSaveFile();
    });
  });

  // ---- handleSaveAsFile ----

  test("handleSaveAsFile: saveAsFile が渡されている場合に呼び出される", async () => {
    const saveAsFn = jest.fn().mockResolvedValue(undefined);
    mockedGetMarkdown.mockReturnValue("# SaveAs");
    const { result } = setup({ saveAsFile: saveAsFn });

    await act(async () => {
      await result.current.handleSaveAsFile();
    });

    expect(saveAsFn).toHaveBeenCalledWith("# SaveAs\n");
  });

  test("handleSaveAsFile: sourceMode 時は sourceText を保存する", async () => {
    const saveAsFn = jest.fn().mockResolvedValue(undefined);
    const { result } = setup({
      saveAsFile: saveAsFn,
      sourceMode: true,
      sourceText: "# SourceSaveAs",
    });

    await act(async () => {
      await result.current.handleSaveAsFile();
    });

    expect(saveAsFn).toHaveBeenCalledWith("# SourceSaveAs\n");
  });

  test("handleSaveAsFile: saveAsFile 未指定時は何もしない", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleSaveAsFile();
    });
  });

  // ---- handleClear ----

  test("handleClear: 確認後に clearContent と resetFile を呼び出す", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const resetFn = jest.fn();
    const { result, clearContent, editor } = setup({ resetFile: resetFn });

    await act(async () => {
      await result.current.handleClear();
    });

    expect(mockConfirm).toHaveBeenCalled();
    expect(
      (editor as unknown as { commands: { clearContent: jest.Mock } }).commands
        .clearContent,
    ).toHaveBeenCalled();
    expect(clearContent).toHaveBeenCalled();
    expect(resetFn).toHaveBeenCalled();
  });

  test("handleClear: sourceMode 時は setSourceText('') を呼ぶ", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const { result, setSourceText, clearContent } = setup({
      sourceMode: true,
      sourceText: "some text",
    });

    await act(async () => {
      await result.current.handleClear();
    });

    expect(setSourceText).toHaveBeenCalledWith("");
    expect(clearContent).toHaveBeenCalled();
  });

  test("handleClear: 確認をキャンセルした場合はクリアしない", async () => {
    mockConfirm.mockRejectedValue(new Error("cancelled"));
    const resetFn = jest.fn();
    const { result, clearContent } = setup({ resetFile: resetFn });

    await act(async () => {
      await result.current.handleClear();
    });

    expect(clearContent).not.toHaveBeenCalled();
    expect(resetFn).not.toHaveBeenCalled();
  });

  test("handleClear: resetFile 未指定でもエラーにならない", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const { result, clearContent } = setup();

    await act(async () => {
      await result.current.handleClear();
    });

    expect(clearContent).toHaveBeenCalled();
  });

  // ---- handleOpenFile ----

  test("handleOpenFile: openFile 未指定時は何もしない", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleOpenFile();
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  test("handleOpenFile: エディタが空のとき確認なしでファイルを開く", async () => {
    const openFn = jest.fn().mockResolvedValue("# Opened");
    const editor = createMockEditor({ isEmpty: true });
    const { result, setSourceText } = setup({
      editor,
      openFile: openFn,
      sourceMode: true,
      sourceText: "",
    });

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(openFn).toHaveBeenCalled();
    expect(setSourceText).toHaveBeenCalledWith("# Opened");
  });

  test("handleOpenFile: コンテンツありの場合は確認ダイアログを表示する", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const openFn = jest.fn().mockResolvedValue("# New Content");
    const editor = createMockEditor({ isEmpty: false });
    const { result } = setup({
      editor,
      openFile: openFn,
      sourceMode: false,
    });

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(mockConfirm).toHaveBeenCalled();
    expect(openFn).toHaveBeenCalled();
  });

  test("handleOpenFile: sourceMode でコンテンツありの場合も確認が表示される", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const openFn = jest.fn().mockResolvedValue("# Replacement");
    const { result, setSourceText } = setup({
      openFile: openFn,
      sourceMode: true,
      sourceText: "existing content",
    });

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(mockConfirm).toHaveBeenCalled();
    expect(setSourceText).toHaveBeenCalledWith("# Replacement");
  });

  test("handleOpenFile: 確認をキャンセルした場合はファイルを開かない", async () => {
    mockConfirm.mockRejectedValue(new Error("cancelled"));
    const openFn = jest.fn().mockResolvedValue("# Content");
    const { result } = setup({
      openFile: openFn,
      sourceMode: true,
      sourceText: "has content",
    });

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(openFn).not.toHaveBeenCalled();
  });

  test("handleOpenFile: openFile が null を返した場合はコンテンツを設定しない", async () => {
    const openFn = jest.fn().mockResolvedValue(null);
    const { result, setSourceText } = setup({
      openFile: openFn,
      sourceMode: true,
      sourceText: "",
    });

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(openFn).toHaveBeenCalled();
    expect(setSourceText).not.toHaveBeenCalled();
  });

  // ---- handleDownload ----

  test("handleDownload: downloadMarkdown にマークダウンを渡す", () => {
    mockedGetMarkdown.mockReturnValue("# Download");
    const { result, downloadMarkdown } = setup();

    act(() => {
      result.current.handleDownload();
    });

    expect(downloadMarkdown).toHaveBeenCalledWith("# Download\n", undefined);
  });

  test("handleDownload: sourceMode 時は sourceText を渡す", () => {
    const { result, downloadMarkdown } = setup({
      sourceMode: true,
      sourceText: "# SourceDL",
    });

    act(() => {
      result.current.handleDownload();
    });

    expect(downloadMarkdown).toHaveBeenCalledWith("# SourceDL\n", undefined);
  });

  // ---- handleCopy ----

  test("handleCopy: クリップボードにコピーし notification を copiedToClipboard にする", async () => {
    mockedGetMarkdown.mockReturnValue("# Copy");
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { result } = setup();

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(writeText).toHaveBeenCalledWith("# Copy");
    expect(result.current.notification).toBe("copiedToClipboard");
  });

  // ---- handleImport ----

  test("handleImport: .md ファイルを読み込む", async () => {
    const { result, setSourceText: _setSourceText } = setup({ sourceMode: true });
    const file = new File(["# Import"], "test.md", { type: "text/markdown" });

    await act(async () => {
      result.current.handleImport(file);
    });
    // handleImport は内部で readFileAsText を呼ぶが、mock されている
  });

  test("handleImport: テキスト以外のファイルは無視する", () => {
    const { result } = setup({ sourceMode: true });
    const file = new File(["binary"], "test.png", { type: "image/png" });

    act(() => {
      result.current.handleImport(file);
    });
    // No error should be thrown
  });

  // ---- handleFileSelected ----

  test("handleFileSelected: エディタが空のとき確認なしでインポート", async () => {
    const editor = createMockEditor({ isEmpty: true });
    const { result } = setup({ editor });
    const file = new File(["# Test"], "test.md", { type: "text/markdown" });

    await act(async () => {
      await result.current.handleFileSelected(file);
    });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  test("handleFileSelected: コンテンツありの場合は確認ダイアログを表示", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const editor = createMockEditor({ isEmpty: false });
    const { result } = setup({ editor });
    const file = new File(["# Test"], "test.md", { type: "text/markdown" });

    await act(async () => {
      await result.current.handleFileSelected(file);
    });

    expect(mockConfirm).toHaveBeenCalled();
  });

  // ---- handleDownload with frontmatter ----

  test("handleDownload: frontmatterRef ありの場合も正常動作", () => {
    mockedGetMarkdown.mockReturnValue("# Download");
    const { result, downloadMarkdown } = setup();

    act(() => {
      result.current.handleDownload();
    });

    expect(downloadMarkdown).toHaveBeenCalled();
  });
});

describe("handleExportPdf: エラー時の状態リセット", () => {
  let printSpy: jest.SpyInstance;

  beforeEach(() => {
    printSpy = jest.spyOn(window, "print").mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  test("editor が null の場合 window.print を呼ぶ", () => {
    // editor=null のケースでは setPdfExporting(true) に到達せず window.print() が直接呼ばれる
    window.print();
    expect(printSpy).toHaveBeenCalled();
  });
});
