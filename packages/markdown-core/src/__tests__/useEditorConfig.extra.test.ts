/**
 * useEditorConfig.ts の追加カバレッジテスト
 * 未カバーのブランチ: handleDOMEvents (dragleave, mousemove, mousedown, click, copy, cut)、
 * handleDrop (mdFile, images)、handlePaste (image処理)、onUpdate、onCreate
 */

import { renderHook, act } from "@testing-library/react";

jest.mock("../editorExtensions", () => ({
  getBaseExtensions: jest.fn().mockReturnValue([]),
}));

jest.mock("@tiptap/extension-placeholder", () => ({
  __esModule: true,
  default: { configure: jest.fn().mockReturnValue({ name: "placeholder" }) },
}));

jest.mock("../extensions/customHardBreak", () => ({
  CustomHardBreak: { name: "customHardBreak" },
}));

jest.mock("../extensions/deleteLineExtension", () => ({
  DeleteLineExtension: { name: "deleteLineExtension" },
}));

jest.mock("../extensions/reviewModeExtension", () => ({
  ReviewModeExtension: { name: "reviewModeExtension" },
  reviewModeStorage: jest.fn().mockReturnValue({ enabled: false }),
}));

jest.mock("../extensions/slashCommandExtension", () => ({
  SlashCommandExtension: {
    configure: jest.fn().mockReturnValue({ name: "slashCommand" }),
  },
}));

jest.mock("../searchReplaceExtension", () => ({
  SearchReplaceExtension: { name: "searchReplace" },
}));

jest.mock("../extensions/changeGutterExtension", () => ({
  ChangeGutterExtension: { name: "changeGutter" },
}));

jest.mock("../types", () => ({
  extractHeadings: jest.fn().mockReturnValue([]),
  getMarkdownFromEditor: jest.fn().mockReturnValue("# Test"),
  getEditorStorage: jest.fn().mockReturnValue({}),
}));

jest.mock("../utils/blockClipboard", () => ({
  handleBlockClipboardEvent: jest.fn().mockReturnValue(false),
  performBlockCopy: jest.fn().mockReturnValue(false),
  setHandledByKeydown: jest.fn(),
  getCopiedBlockNode: jest.fn().mockReturnValue(null),
}));

jest.mock("../utils/editorContentLoader", () => ({
  setTrailingNewline: jest.fn(),
}));

jest.mock("../utils/tocHelpers", () => ({
  toGitHubSlug: jest.fn().mockReturnValue("test-slug"),
}));

jest.mock("../constants/timing", () => ({
  DEBOUNCE_MEDIUM: 300,
}));

import { useEditorConfig } from "../hooks/useEditorConfig";
import { handleBlockClipboardEvent } from "../utils/blockClipboard";
import { extractHeadings, getMarkdownFromEditor } from "../types";
import { setTrailingNewline } from "../utils/editorContentLoader";

function createRefs() {
  return {
    editor: { current: null },
    setEditorMarkdown: { current: jest.fn() },
    setHeadings: { current: jest.fn() },
    headingsDebounce: { current: null },
    handleImport: { current: jest.fn() },
    onFileDragOver: { current: jest.fn() },
    slashCommandCallback: { current: jest.fn() },
  };
}

function getConfig(overrides?: Partial<{ refs: any; initialContent: string | null; initialTrailingNewline: boolean }>) {
  const refs = overrides?.refs ?? createRefs();
  const { result } = renderHook(() =>
    useEditorConfig({
      t: (key: string) => key,
      initialContent: overrides?.initialContent ?? "",
      initialTrailingNewline: overrides?.initialTrailingNewline,
      saveContent: jest.fn(),
      refs: refs as any,
      setHeadingMenu: jest.fn(),
    }),
  );
  return { result, refs };
}

describe("useEditorConfig - handleDOMEvents extra", () => {
  it("dragleave: エディタ外に出た場合 onFileDragOver(false) を呼ぶ", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const dom = document.createElement("div");
    const view = { dom } as any;
    const event = { relatedTarget: document.createElement("span") } as any;

    result.current.editorProps.handleDOMEvents.dragleave(view, event);
    expect(refs.onFileDragOver.current).toHaveBeenCalledWith(false);
  });

  it("dragleave: エディタ内に留まる場合は onFileDragOver を呼ばない", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const dom = document.createElement("div");
    const child = document.createElement("span");
    dom.appendChild(child);
    const view = { dom } as any;
    const event = { relatedTarget: child } as any;

    refs.onFileDragOver.current.mockClear();
    result.current.editorProps.handleDOMEvents.dragleave(view, event);
    expect(refs.onFileDragOver.current).not.toHaveBeenCalled();
  });

  it("mousemove: ctrlKey 変更で ctrl-held をトグルする", () => {
    const { result } = getConfig();
    const dom = document.createElement("div");
    const view = { dom } as any;

    // ctrlKey=true → add class
    result.current.editorProps.handleDOMEvents.mousemove(view, { ctrlKey: true, metaKey: false } as any);
    expect(dom.classList.contains("ctrl-held")).toBe(true);

    // ctrlKey=false → remove class
    result.current.editorProps.handleDOMEvents.mousemove(view, { ctrlKey: false, metaKey: false } as any);
    expect(dom.classList.contains("ctrl-held")).toBe(false);
  });

  it("mousedown: anchor リンクで preventDefault を呼ぶ", () => {
    const { result } = getConfig();
    const dom = document.createElement("div");
    const view = { dom } as any;
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#test");
    dom.appendChild(anchor);

    const event = {
      target: anchor,
      preventDefault: jest.fn(),
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.mousedown(view, event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(handled).toBe(true);
  });

  it("mousedown: anchor 以外は false を返す", () => {
    const { result } = getConfig();
    const dom = document.createElement("div");
    const span = document.createElement("span");
    dom.appendChild(span);
    const view = { dom } as any;
    const event = { target: span, preventDefault: jest.fn() } as any;

    const handled = result.current.editorProps.handleDOMEvents.mousedown(view, event);
    expect(handled).toBe(false);
  });

  it("click: ハンドラが呼ばれても false を返す (デフォルトケース)", () => {
    const { result } = getConfig();
    const dom = document.createElement("div");
    const span = document.createElement("span");
    dom.appendChild(span);
    const view = { dom } as any;
    const event = { target: span } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    expect(handled).toBe(false);
  });

  it("copy: handleBlockClipboardEvent を呼ぶ", () => {
    const { result } = getConfig();
    const view = {} as any;
    const event = {} as any;

    (handleBlockClipboardEvent as jest.Mock).mockReturnValue(false);
    const handled = result.current.editorProps.handleDOMEvents.copy(view, event);
    expect(handleBlockClipboardEvent).toHaveBeenCalledWith(view, event, false);
    expect(handled).toBe(false);
  });

  it("copy: handleBlockClipboardEvent が true を返すと true", () => {
    const { result } = getConfig();
    const view = {} as any;
    const event = {} as any;

    (handleBlockClipboardEvent as jest.Mock).mockReturnValue(true);
    const handled = result.current.editorProps.handleDOMEvents.copy(view, event);
    expect(handled).toBe(true);
  });

  it("cut: handleBlockClipboardEvent を呼ぶ", () => {
    const { result } = getConfig();
    const view = {} as any;
    const event = {} as any;

    (handleBlockClipboardEvent as jest.Mock).mockReturnValue(false);
    const handled = result.current.editorProps.handleDOMEvents.cut(view, event);
    expect(handleBlockClipboardEvent).toHaveBeenCalledWith(view, event, true);
    expect(handled).toBe(false);
  });

  it("keydown: Meta key adds ctrl-held class", () => {
    const { result } = getConfig();
    const dom = document.createElement("div");
    const view = { dom } as any;
    const event = { key: "Meta", ctrlKey: false, metaKey: false } as any;

    result.current.editorProps.handleDOMEvents.keydown(view, event);
    expect(dom.classList.contains("ctrl-held")).toBe(true);
  });

  it("keyup: Meta key removes ctrl-held class", () => {
    const { result } = getConfig();
    const dom = document.createElement("div");
    dom.classList.add("ctrl-held");
    const view = { dom } as any;
    const event = { key: "Meta" } as any;

    result.current.editorProps.handleDOMEvents.keyup(view, event);
    expect(dom.classList.contains("ctrl-held")).toBe(false);
  });
});

describe("useEditorConfig - onUpdate", () => {
  it("onUpdate calls saveContent and setEditorMarkdown", () => {
    const saveContent = jest.fn();
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent,
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const mockEditor = {} as any;
    (getMarkdownFromEditor as jest.Mock).mockReturnValue("# Updated");

    act(() => {
      result.current.onUpdate({ editor: mockEditor });
    });

    expect(saveContent).toHaveBeenCalledWith("# Updated");
    expect(refs.setEditorMarkdown.current).toHaveBeenCalledWith("# Updated");
  });
});

describe("useEditorConfig - onCreate", () => {
  it("onCreate calls setTrailingNewline and extracts headings", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "# Hello",
        initialTrailingNewline: true,
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const mockEditor = {
      extensionManager: { extensions: [] },
    } as any;

    act(() => {
      result.current.onCreate({ editor: mockEditor });
    });

    expect(setTrailingNewline).toHaveBeenCalledWith(mockEditor, true);
    expect(extractHeadings).toHaveBeenCalledWith(mockEditor);
  });

  it("onCreate patches blockquote serializer if available", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const bqStorage = { markdown: { serialize: null as any } };
    const mockEditor = {
      extensionManager: {
        extensions: [{ name: "blockquote", storage: bqStorage }],
      },
    } as any;

    act(() => {
      result.current.onCreate({ editor: mockEditor });
    });

    expect(typeof bqStorage.markdown.serialize).toBe("function");
  });
});

describe("useEditorConfig - handleDrop md file", () => {
  it("md ファイルのドロップは handleImport を呼び true を返す", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const mdFile = new File(["# Test"], "test.md", { type: "text/markdown" });
    const view = {} as any;
    const event = {
      dataTransfer: {
        files: { length: 1, [Symbol.iterator]: () => [mdFile][Symbol.iterator]() },
        items: [],
      },
      preventDefault: jest.fn(),
      clientX: 0,
      clientY: 0,
    } as any;
    // Make files iterable
    event.dataTransfer.files = [mdFile];

    const handled = result.current.editorProps.handleDrop(view, event, null as any, false);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe("useEditorConfig - initialTrailingNewline false", () => {
  it("initialTrailingNewline が未指定の場合 false を使う", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const mockEditor = {
      extensionManager: { extensions: [] },
    } as any;

    act(() => {
      result.current.onCreate({ editor: mockEditor });
    });

    expect(setTrailingNewline).toHaveBeenCalledWith(mockEditor, false);
  });
});

describe("useEditorConfig - handleDrop image files", () => {
  it("画像ファイルのドロップは preventDefault を呼び true を返す", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const imgFile = new File([""], "photo.png", { type: "image/png" });
    const view = {
      state: {
        selection: { from: 0 },
        schema: { nodes: { image: { create: jest.fn() } } },
      },
      posAtCoords: jest.fn(() => ({ pos: 5 })),
    } as any;
    const event = {
      dataTransfer: { files: [imgFile] },
      preventDefault: jest.fn(),
      clientX: 100,
      clientY: 100,
    } as any;

    const handled = result.current.editorProps.handleDrop(view, event, null as any, false);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe("useEditorConfig - handlePaste images", () => {
  it("画像のみのペーストは preventDefault を呼び true を返す", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const mockFile = new File([""], "paste.png", { type: "image/png" });
    const view = {
      state: {
        selection: { from: 0 },
        schema: { nodes: { image: { create: jest.fn() } } },
        tr: { insert: jest.fn().mockReturnThis() },
      },
      dispatch: jest.fn(),
    } as any;
    const event = {
      clipboardData: {
        items: [
          { type: "image/png", kind: "file", getAsFile: () => mockFile },
        ],
      },
      preventDefault: jest.fn(),
    } as any;

    const handled = result.current.editorProps.handlePaste(view, event);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("テキストと画像の混在時は false を返す (Excel等)", () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const view = {} as any;
    const event = {
      clipboardData: {
        items: [
          { type: "image/png", kind: "file" },
          { type: "text/html", kind: "string" },
        ],
      },
    } as any;

    const handled = result.current.editorProps.handlePaste(view, event);
    expect(handled).toBe(false);
  });
});

describe("useEditorConfig - handleDOMEvents keydown VS Code", () => {
  it("VS Code WebView 環境で Ctrl+C はブロックコピーを試みる", () => {
    const refs = createRefs();
    (window as any).__vscode = { postMessage: jest.fn() };

    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const dom = document.createElement("div");
    const view = { dom } as any;
    const event = {
      key: "c",
      ctrlKey: true,
      metaKey: false,
      preventDefault: jest.fn(),
    } as any;

    result.current.editorProps.handleDOMEvents.keydown(view, event);
    // performBlockCopy is mocked to return false, so no preventDefault

    delete (window as any).__vscode;
  });
});
