/**
 * useEditorConfig のユニットテスト
 *
 * エディタ設定 hook のヘルパー関数と設定オブジェクト生成を検証する。
 */

import { renderHook } from "@testing-library/react";

// 必要なモック
jest.mock("../editorExtensions", () => ({
  getBaseExtensions: jest.fn().mockReturnValue([]),
}));

jest.mock("@anytime-markdown/markdown-extension-placeholder", () => ({
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
import { getMarkdownFromEditor } from "../types";

function createRefs() {
  return {
    editor: { current: { isDestroyed: false } },
    setEditorMarkdown: { current: jest.fn() },
    setHeadings: { current: jest.fn() },
    headingsDebounce: { current: null },
    handleImport: { current: jest.fn() },
    onFileDragOver: { current: jest.fn() },
    slashCommandCallback: { current: jest.fn() },
    inlineMergeOpen: { current: false },
  };
}

describe("useEditorConfig", () => {
  it("extensions 配列を返す", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "# Hello",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(result.current.extensions).toBeDefined();
    expect(Array.isArray(result.current.extensions)).toBe(true);
    expect(result.current.extensions.length).toBeGreaterThan(0);
  });

  it("editorProps を返す", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "# Hello",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(result.current.editorProps).toBeDefined();
    expect(result.current.editorProps.handleDrop).toBeDefined();
    expect(result.current.editorProps.handlePaste).toBeDefined();
    expect(result.current.editorProps.handleDOMEvents).toBeDefined();
  });

  it("initialContent が null のとき空文字列を content に設定する", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: null,
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(result.current.content).toBe("");
  });

  it("initialContent が指定されたとき content に設定する", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "# Test Content",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(result.current.content).toBe("# Test Content");
  });

  it("autofocus は 'start' が設定される", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(result.current.autofocus).toBe("start");
  });

  it("immediatelyRender は false が設定される", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(result.current.immediatelyRender).toBe(false);
  });

  it("onUpdate コールバックが設定される", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(typeof result.current.onUpdate).toBe("function");
  });

  it("onCreate コールバックが設定される", () => {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: createRefs() as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    expect(typeof result.current.onCreate).toBe("function");
  });

  describe("handleDOMEvents", () => {
    it("dragover イベントでファイルがある場合 onFileDragOver を呼ぶ", () => {
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

      const view = { dom: document.createElement("div") } as any;
      const event = { dataTransfer: { types: ["Files"] } } as any;

      const handled = result.current.editorProps.handleDOMEvents.dragover(view, event);

      expect(refs.onFileDragOver.current).toHaveBeenCalledWith(true);
      expect(handled).toBe(false);
    });

    it("drop イベントで onFileDragOver(false) を呼ぶ", () => {
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

      const handled = result.current.editorProps.handleDOMEvents.drop();

      expect(refs.onFileDragOver.current).toHaveBeenCalledWith(false);
      expect(handled).toBe(false);
    });

    it("keydown で Ctrl キーが押されると ctrl-held クラスを追加する", () => {
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
      const event = { key: "Control", ctrlKey: false, metaKey: false } as any;

      result.current.editorProps.handleDOMEvents.keydown(view, event);

      expect(dom.classList.contains("ctrl-held")).toBe(true);
    });

    it("keyup で Ctrl キーを離すと ctrl-held クラスを除去する", () => {
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
      dom.classList.add("ctrl-held");
      const view = { dom } as any;
      const event = { key: "Control" } as any;

      result.current.editorProps.handleDOMEvents.keyup(view, event);

      expect(dom.classList.contains("ctrl-held")).toBe(false);
    });

    it("blur で ctrl-held クラスを除去する", () => {
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
      dom.classList.add("ctrl-held");
      const view = { dom } as any;

      result.current.editorProps.handleDOMEvents.blur(view);

      expect(dom.classList.contains("ctrl-held")).toBe(false);
    });
  });

  describe("handleDrop", () => {
    it("moved=true のとき false を返す", () => {
      const { result } = renderHook(() =>
        useEditorConfig({
          t: (key: string) => key,
          initialContent: "",
          saveContent: jest.fn(),
          refs: createRefs() as any,
          setHeadingMenu: jest.fn(),
        }),
      );

      const view = {} as any;
      const event = { dataTransfer: { files: [] } } as any;
      const handled = result.current.editorProps.handleDrop(view, event, null as any, true);

      expect(handled).toBe(false);
    });

    it("ファイルなしのとき false を返す", () => {
      const { result } = renderHook(() =>
        useEditorConfig({
          t: (key: string) => key,
          initialContent: "",
          saveContent: jest.fn(),
          refs: createRefs() as any,
          setHeadingMenu: jest.fn(),
        }),
      );

      const view = {} as any;
      const event = { dataTransfer: { files: { length: 0 } } } as any;
      const handled = result.current.editorProps.handleDrop(view, event, null as any, false);

      expect(handled).toBe(false);
    });
  });

  describe("handlePaste", () => {
    it("clipboardData がない場合 false を返す", () => {
      const { result } = renderHook(() =>
        useEditorConfig({
          t: (key: string) => key,
          initialContent: "",
          saveContent: jest.fn(),
          refs: createRefs() as any,
          setHeadingMenu: jest.fn(),
        }),
      );

      const view = {} as any;
      const event = { clipboardData: null } as any;
      const handled = result.current.editorProps.handlePaste(view, event);

      expect(handled).toBe(false);
    });

    it("画像がない場合 false を返す", () => {
      const { result } = renderHook(() =>
        useEditorConfig({
          t: (key: string) => key,
          initialContent: "",
          saveContent: jest.fn(),
          refs: createRefs() as any,
          setHeadingMenu: jest.fn(),
        }),
      );

      const view = {} as any;
      const event = {
        clipboardData: {
          items: [{ type: "text/plain", kind: "string" }],
        },
      } as any;
      const handled = result.current.editorProps.handlePaste(view, event);

      expect(handled).toBe(false);
    });
  });
});

describe("onUpdate 遅延シリアライズ", () => {
  const getMd = getMarkdownFromEditor as jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getMd.mockReturnValue("# Test");
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function buildOnUpdate(refs: ReturnType<typeof createRefs>, saveContent = jest.fn()) {
    const { result } = renderHook(() =>
      useEditorConfig({
        t: (k: string) => k,
        initialContent: "",
        saveContent,
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );
    const onUpdate = result.current.onUpdate as (a: { editor: unknown }) => void;
    return { onUpdate, saveContent };
  }

  it("マージ閉時: onUpdate は getMarkdownFromEditor を同期実行しない（永続化は debounce へ遅延）", () => {
    const refs = createRefs();
    const editor = { isDestroyed: false };
    refs.editor.current = editor as never;
    const { onUpdate } = buildOnUpdate(refs);

    onUpdate({ editor });

    expect(getMd).not.toHaveBeenCalled();
  });

  it("マージ閉時: onUpdate は setEditorMarkdown を呼ばない", () => {
    const refs = createRefs();
    const editor = { isDestroyed: false };
    refs.editor.current = editor as never;
    const { onUpdate } = buildOnUpdate(refs);

    onUpdate({ editor });

    expect(refs.setEditorMarkdown.current).not.toHaveBeenCalled();
  });

  it("マージ閉時: saveContent にプロデューサを渡し、解決すると最新 Markdown になる", () => {
    const refs = createRefs();
    const editor = { isDestroyed: false };
    refs.editor.current = editor as never;
    const { onUpdate, saveContent } = buildOnUpdate(refs);

    onUpdate({ editor });

    expect(saveContent).toHaveBeenCalledTimes(1);
    const arg = (saveContent as jest.Mock).mock.calls[0][0];
    expect(typeof arg).toBe("function");
    expect(arg()).toBe("# Test");
    // プロデューサを解決したときにだけシリアライズされる
    expect(getMd).toHaveBeenCalledTimes(1);
  });

  it("マージ開時: onUpdate は setEditorMarkdown を最新 Markdown で呼ぶ（差分追従を維持）", () => {
    const refs = createRefs();
    refs.inlineMergeOpen.current = true;
    const editor = { isDestroyed: false };
    refs.editor.current = editor as never;
    const { onUpdate } = buildOnUpdate(refs);

    onUpdate({ editor });

    expect(refs.setEditorMarkdown.current).toHaveBeenCalledWith("# Test");
  });
});
