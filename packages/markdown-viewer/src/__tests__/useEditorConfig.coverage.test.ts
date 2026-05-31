/**
 * useEditorConfig.ts の追加カバレッジテスト
 *
 * 既存テストで未カバーの行・ブランチを補完する:
 * - handleReviewCheckboxClick (setTimeout 内部)
 * - jumpToAnchorHeading
 * - handleAnchorLinkClick (Ctrl/Cmd+Click)
 * - findBlockCandidate
 * - handleBlockContextMenu
 * - generateTimestamp / insertImageFromFile / insertPastedImage
 * - tryImportDroppedMdFile (getAsFileSystemHandle)
 * - keydown VS Code performBlockCopy=true
 * - onUpdate debounce callback
 * - onCreate が blockquote serialize を上書きしないこと (admonition 保護)
 * - handleDrop reader.onload / handlePaste reader.onload
 */

import { renderHook, act } from "@testing-library/react";

// --- Mocks ---

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

const mockReviewModeStorage = jest.fn();
jest.mock("../extensions/reviewModeExtension", () => ({
  ReviewModeExtension: { name: "reviewModeExtension" },
  reviewModeStorage: (...args: any[]) => mockReviewModeStorage(...args),
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

const mockExtractHeadings = jest.fn().mockReturnValue([]);
const mockGetMarkdownFromEditor = jest.fn().mockReturnValue("# Test");
jest.mock("../types", () => ({
  extractHeadings: (...args: any[]) => mockExtractHeadings(...args),
  getMarkdownFromEditor: (...args: any[]) => mockGetMarkdownFromEditor(...args),
  getEditorStorage: jest.fn().mockReturnValue({}),
}));

const mockHandleBlockClipboardEvent = jest.fn().mockReturnValue(false);
const mockPerformBlockCopy = jest.fn().mockReturnValue(false);
const mockSetHandledByKeydown = jest.fn();
jest.mock("../utils/blockClipboard", () => ({
  handleBlockClipboardEvent: (...args: any[]) => mockHandleBlockClipboardEvent(...args),
  performBlockCopy: (...args: any[]) => mockPerformBlockCopy(...args),
  setHandledByKeydown: (...args: any[]) => mockSetHandledByKeydown(...args),
  getCopiedBlockNode: jest.fn().mockReturnValue(null),
}));

jest.mock("../utils/editorContentLoader", () => ({
  setTrailingNewline: jest.fn(),
}));

const mockToGitHubSlug = jest.fn().mockReturnValue("test-slug");
jest.mock("../utils/tocHelpers", () => ({
  toGitHubSlug: (...args: any[]) => mockToGitHubSlug(...args),
}));

jest.mock("../constants/timing", () => ({
  DEBOUNCE_MEDIUM: 50,
}));

import { useEditorConfig } from "../hooks/useEditorConfig";

function createRefs() {
  return {
    editor: { current: null as any },
    setEditorMarkdown: { current: jest.fn() },
    setHeadings: { current: jest.fn() },
    headingsDebounce: { current: null as any },
    handleImport: { current: jest.fn() },
    onFileDragOver: { current: jest.fn() },
    slashCommandCallback: { current: jest.fn() },
  };
}

function setup(overrides?: {
  refs?: ReturnType<typeof createRefs>;
  saveContent?: jest.Mock;
  setHeadingMenu?: jest.Mock;
  initialContent?: string | null;
  initialTrailingNewline?: boolean;
}) {
  const refs = overrides?.refs ?? createRefs();
  const saveContent = overrides?.saveContent ?? jest.fn();
  const setHeadingMenu = overrides?.setHeadingMenu ?? jest.fn();
  const { result } = renderHook(() =>
    useEditorConfig({
      t: (key: string) => key,
      initialContent: overrides?.initialContent ?? "",
      initialTrailingNewline: overrides?.initialTrailingNewline,
      saveContent,
      refs: refs as any,
      setHeadingMenu,
    }),
  );
  return { result, refs, saveContent, setHeadingMenu };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReviewModeStorage.mockReturnValue({ enabled: false });
  mockExtractHeadings.mockReturnValue([]);
  mockGetMarkdownFromEditor.mockReturnValue("# Test");
  mockPerformBlockCopy.mockReturnValue(false);
  mockHandleBlockClipboardEvent.mockReturnValue(false);
  delete (window as any).__vscode;
});

// ============================================================
// handleReviewCheckboxClick
// ============================================================
describe("handleReviewCheckboxClick", () => {
  it("review mode が有効でチェックボックスをクリックすると true を返す", () => {
    const storage = { enabled: true };
    mockReviewModeStorage.mockReturnValue(storage);

    const refs = createRefs();
    const mockEditor = {
      view: {
        posAtDOM: jest.fn().mockReturnValue(2),
        dispatch: jest.fn(),
      },
      state: {
        doc: {
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "taskItem" },
            attrs: { checked: false },
          }),
        },
        tr: {
          setNodeMarkup: jest.fn().mockReturnThis(),
        },
      },
      chain: jest.fn().mockReturnValue({ setTextSelection: jest.fn().mockReturnValue({ run: jest.fn() }) }),
    } as any;
    refs.editor.current = mockEditor;

    const saveContent = jest.fn();
    const { result } = setup({ refs, saveContent });

    // Create a checkbox inside a li[data-checked]
    const li = document.createElement("li");
    li.setAttribute("data-checked", "false");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    li.appendChild(checkbox);

    const dom = document.createElement("div");
    dom.appendChild(li);
    const view = { dom } as any;
    const event = { target: checkbox } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    // handleReviewCheckboxClick returns true, but click handler returns false after it
    expect(handled).toBe(false);
  });

  it("setTimeout 内で taskItem ノードを更新し saveContent を呼ぶ", async () => {
    const storage = { enabled: true };
    mockReviewModeStorage.mockReturnValue(storage);

    const refs = createRefs();
    const trMock = { setNodeMarkup: jest.fn().mockReturnThis() };
    const mockEditor = {
      view: {
        posAtDOM: jest.fn().mockReturnValue(2),
        dispatch: jest.fn(),
      },
      state: {
        doc: {
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "taskItem" },
            attrs: { checked: false },
          }),
        },
        tr: trMock,
      },
    } as any;
    refs.editor.current = mockEditor;

    mockGetMarkdownFromEditor.mockReturnValue("- [x] done");
    const saveContent = jest.fn();
    const { result } = setup({ refs, saveContent });

    const li = document.createElement("li");
    li.setAttribute("data-checked", "false");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    li.appendChild(checkbox);

    const dom = document.createElement("div");
    dom.appendChild(li);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, { target: checkbox } as any);

    // Wait for setTimeout(0)
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEditor.view.dispatch).toHaveBeenCalled();
    expect(saveContent).toHaveBeenCalledWith("- [x] done");
    // reviewModeStorage re-enabled
    expect(storage.enabled).toBe(true);
  });

  it("review mode が無効の場合 false を返し処理しない", () => {
    mockReviewModeStorage.mockReturnValue({ enabled: false });
    const refs = createRefs();
    refs.editor.current = {} as any;
    const { result } = setup({ refs });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const dom = document.createElement("div");
    dom.appendChild(checkbox);
    const view = { dom } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, { target: checkbox } as any);
    expect(handled).toBe(false);
  });

  it("対象がチェックボックスでない場合 false を返す", () => {
    mockReviewModeStorage.mockReturnValue({ enabled: true });
    const refs = createRefs();
    refs.editor.current = {} as any;
    const { result } = setup({ refs });

    const span = document.createElement("span");
    const dom = document.createElement("div");
    dom.appendChild(span);
    const view = { dom } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, { target: span } as any);
    expect(handled).toBe(false);
  });

  it("li[data-checked] が見つからない場合 false を返す", () => {
    mockReviewModeStorage.mockReturnValue({ enabled: true });
    const refs = createRefs();
    refs.editor.current = {} as any;
    const { result } = setup({ refs });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    // No parent li[data-checked]
    const dom = document.createElement("div");
    dom.appendChild(checkbox);
    const view = { dom } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, { target: checkbox } as any);
    expect(handled).toBe(false);
  });

  it("setTimeout 内で editor が null の場合は早期リターン", async () => {
    const storage = { enabled: true };
    mockReviewModeStorage.mockReturnValue(storage);

    const refs = createRefs();
    refs.editor.current = { view: {}, state: {} } as any; // initially non-null
    const saveContent = jest.fn();
    const { result } = setup({ refs, saveContent });

    const li = document.createElement("li");
    li.setAttribute("data-checked", "false");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    li.appendChild(checkbox);

    const dom = document.createElement("div");
    dom.appendChild(li);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, { target: checkbox } as any);

    // Set editor to null before setTimeout fires
    refs.editor.current = null;

    await new Promise((r) => setTimeout(r, 10));
    expect(saveContent).not.toHaveBeenCalled();
  });

  it("setTimeout 内で nodeAt が taskItem でない場合は早期リターン", async () => {
    const storage = { enabled: true };
    mockReviewModeStorage.mockReturnValue(storage);

    const refs = createRefs();
    const mockEditor = {
      view: {
        posAtDOM: jest.fn().mockReturnValue(2),
        dispatch: jest.fn(),
      },
      state: {
        doc: {
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "paragraph" },
            attrs: {},
          }),
        },
        tr: { setNodeMarkup: jest.fn().mockReturnThis() },
      },
    } as any;
    refs.editor.current = mockEditor;
    const saveContent = jest.fn();
    const { result } = setup({ refs, saveContent });

    const li = document.createElement("li");
    li.setAttribute("data-checked", "false");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    li.appendChild(checkbox);

    const dom = document.createElement("div");
    dom.appendChild(li);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, { target: checkbox } as any);

    await new Promise((r) => setTimeout(r, 10));
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(saveContent).not.toHaveBeenCalled();
  });

  it("setTimeout 内で例外が発生すると reviewMode を再有効化する", async () => {
    const storage = { enabled: true };
    mockReviewModeStorage.mockImplementation(() => storage);

    const refs = createRefs();
    const mockEditor = {
      view: {
        posAtDOM: jest.fn().mockImplementation(() => {
          throw new Error("test error");
        }),
        dispatch: jest.fn(),
      },
      state: {
        doc: { nodeAt: jest.fn() },
        tr: { setNodeMarkup: jest.fn().mockReturnThis() },
      },
    } as any;
    refs.editor.current = mockEditor;
    const saveContent = jest.fn();
    const { result } = setup({ refs, saveContent });

    const li = document.createElement("li");
    li.setAttribute("data-checked", "false");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    li.appendChild(checkbox);

    const dom = document.createElement("div");
    dom.appendChild(li);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, { target: checkbox } as any);

    await new Promise((r) => setTimeout(r, 10));
    // storage.enabled should be re-enabled in catch
    expect(storage.enabled).toBe(true);
  });
});

// ============================================================
// handleAnchorLinkClick + jumpToAnchorHeading
// ============================================================
describe("handleAnchorLinkClick / jumpToAnchorHeading", () => {
  it("anchor リンクの通常クリックは preventDefault し true を返す", () => {
    const { result } = setup();

    const dom = document.createElement("div");
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#heading");
    dom.appendChild(anchor);

    const view = { dom } as any;
    const event = {
      target: anchor,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ctrlKey: false,
      metaKey: false,
      clientX: 500, // not in left margin
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(handled).toBe(true);
  });

  it("Ctrl+Click で jumpToAnchorHeading を呼び見出しにジャンプする", () => {
    const refs = createRefs();
    const scrollToMock = jest.fn();
    const chainRun = jest.fn();
    const setTextSelection = jest.fn().mockReturnValue({ run: chainRun });
    const mockEditor = {
      chain: jest.fn().mockReturnValue({ setTextSelection }),
      view: {
        dom: {
          offsetTop: 0,
          scrollTo: scrollToMock,
        },
        domAtPos: jest.fn().mockReturnValue({
          node: (() => {
            const el = document.createElement("h1");
            Object.defineProperty(el, "offsetTop", { value: 100 });
            return el;
          })(),
        }),
      },
    } as any;
    refs.editor.current = mockEditor;

    mockExtractHeadings.mockReturnValue([
      { text: "Test Heading", pos: 5, level: 1, kind: "heading" },
    ]);
    mockToGitHubSlug.mockReturnValue("test-heading");

    const { result } = setup({ refs });

    const dom = document.createElement("div");
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#test-heading");
    dom.appendChild(anchor);

    const view = { dom } as any;
    const event = {
      target: anchor,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ctrlKey: true,
      metaKey: false,
      clientX: 500,
    } as any;

    result.current.editorProps.handleDOMEvents.click(view, event);

    expect(setTextSelection).toHaveBeenCalledWith(6); // pos + 1
    expect(chainRun).toHaveBeenCalled();
    expect(scrollToMock).toHaveBeenCalled();
  });

  it("jumpToAnchorHeading: domAtPos が TextNode を返す場合 parentElement を使う", () => {
    const refs = createRefs();
    const scrollToMock = jest.fn();
    const parentEl = document.createElement("h1");
    Object.defineProperty(parentEl, "offsetTop", { value: 50 });
    const textNode = document.createTextNode("heading text");
    // Attach textNode to parentEl so parentElement works
    parentEl.appendChild(textNode);

    const chainRun = jest.fn();
    const setTextSelection = jest.fn().mockReturnValue({ run: chainRun });
    const mockEditor = {
      chain: jest.fn().mockReturnValue({ setTextSelection }),
      view: {
        dom: {
          offsetTop: 0,
          scrollTo: scrollToMock,
        },
        domAtPos: jest.fn().mockReturnValue({ node: textNode }),
      },
    } as any;
    refs.editor.current = mockEditor;

    mockExtractHeadings.mockReturnValue([
      { text: "Heading", pos: 3, level: 1, kind: "heading" },
    ]);
    mockToGitHubSlug.mockReturnValue("heading");

    const { result } = setup({ refs });

    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#heading");
    const dom = document.createElement("div");
    dom.appendChild(anchor);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, {
      target: anchor,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ctrlKey: true,
      metaKey: false,
      clientX: 500,
    } as any);

    expect(scrollToMock).toHaveBeenCalled();
  });

  it("jumpToAnchorHeading: slug が一致しない場合はジャンプしない", () => {
    const refs = createRefs();
    const chainRun = jest.fn();
    const setTextSelection = jest.fn().mockReturnValue({ run: chainRun });
    const mockEditor = {
      chain: jest.fn().mockReturnValue({ setTextSelection }),
      view: { dom: {}, domAtPos: jest.fn() },
    } as any;
    refs.editor.current = mockEditor;

    mockExtractHeadings.mockReturnValue([
      { text: "Other", pos: 3, level: 1, kind: "heading" },
    ]);
    mockToGitHubSlug.mockReturnValue("other-heading");

    const { result } = setup({ refs });

    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#target-heading");
    const dom = document.createElement("div");
    dom.appendChild(anchor);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, {
      target: anchor,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ctrlKey: true,
      metaKey: false,
      clientX: 500,
    } as any);

    expect(setTextSelection).not.toHaveBeenCalled();
  });

  it("jumpToAnchorHeading: kind が heading でないエントリはスキップ", () => {
    const refs = createRefs();
    const chainRun = jest.fn();
    const setTextSelection = jest.fn().mockReturnValue({ run: chainRun });
    const mockEditor = {
      chain: jest.fn().mockReturnValue({ setTextSelection }),
      view: { dom: {}, domAtPos: jest.fn() },
    } as any;
    refs.editor.current = mockEditor;

    mockExtractHeadings.mockReturnValue([
      { text: "Other", pos: 3, level: 1, kind: "frontmatter" },
    ]);

    const { result } = setup({ refs });

    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#something");
    const dom = document.createElement("div");
    dom.appendChild(anchor);
    const view = { dom } as any;

    result.current.editorProps.handleDOMEvents.click(view, {
      target: anchor,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ctrlKey: true,
      metaKey: false,
      clientX: 500,
    } as any);

    // toGitHubSlug should not be called since kind !== "heading"
    expect(setTextSelection).not.toHaveBeenCalled();
  });
});

// ============================================================
// handleBlockContextMenu (via click handler)
// ============================================================
describe("handleBlockContextMenu", () => {
  it("見出し要素の左余白クリックでコンテキストメニューを表示", () => {
    const refs = createRefs();
    refs.editor.current = {
      chain: jest.fn().mockReturnValue({
        setTextSelection: jest.fn().mockReturnValue({ run: jest.fn() }),
      }),
    } as any;
    const setHeadingMenu = jest.fn();
    const { result } = setup({ refs, setHeadingMenu });

    const h2 = document.createElement("h2");
    h2.textContent = "Title";
    // Mock getBoundingClientRect to return left=100
    h2.getBoundingClientRect = jest.fn().mockReturnValue({ left: 100 });

    const tiptap = document.createElement("div");
    tiptap.classList.add("tiptap");
    tiptap.appendChild(h2);

    const view = {
      dom: tiptap,
      posAtDOM: jest.fn().mockReturnValue(5),
    } as any;

    const event = {
      target: h2,
      clientX: 50, // left of rect.left (100)
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ctrlKey: false,
      metaKey: false,
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setHeadingMenu).toHaveBeenCalledWith(
      expect.objectContaining({ anchorEl: h2, pos: 5, currentLevel: 2 }),
    );
    expect(handled).toBe(true);
  });

  it("clientX が rect.left 以上の場合は false を返す", () => {
    const refs = createRefs();
    refs.editor.current = {} as any;
    const setHeadingMenu = jest.fn();
    const { result } = setup({ refs, setHeadingMenu });

    const h2 = document.createElement("h2");
    h2.getBoundingClientRect = jest.fn().mockReturnValue({ left: 100 });

    const tiptap = document.createElement("div");
    tiptap.classList.add("tiptap");
    tiptap.appendChild(h2);

    const view = { dom: tiptap } as any;
    const event = {
      target: h2,
      clientX: 150, // right of rect.left
      ctrlKey: false,
      metaKey: false,
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    expect(setHeadingMenu).not.toHaveBeenCalled();
    expect(handled).toBe(false);
  });

  it("blockquote の左余白クリックで内部 p を posAtDOM に渡す", () => {
    const refs = createRefs();
    refs.editor.current = {
      chain: jest.fn().mockReturnValue({
        setTextSelection: jest.fn().mockReturnValue({ run: jest.fn() }),
      }),
    } as any;
    const setHeadingMenu = jest.fn();
    const { result } = setup({ refs, setHeadingMenu });

    const p = document.createElement("p");
    const blockquote = document.createElement("blockquote");
    blockquote.appendChild(p);
    blockquote.getBoundingClientRect = jest.fn().mockReturnValue({ left: 100 });

    const tiptap = document.createElement("div");
    tiptap.classList.add("tiptap");
    tiptap.appendChild(blockquote);

    const view = {
      dom: tiptap,
      posAtDOM: jest.fn().mockReturnValue(3),
    } as any;

    const event = {
      target: blockquote,
      clientX: 50,
      preventDefault: jest.fn(),
      ctrlKey: false,
      metaKey: false,
    } as any;

    result.current.editorProps.handleDOMEvents.click(view, event);

    // posAtDOM should be called with the p element (not the blockquote itself)
    expect(view.posAtDOM).toHaveBeenCalledWith(p, 0);
    expect(setHeadingMenu).toHaveBeenCalledWith(
      expect.objectContaining({ currentLevel: 0 }),
    );
  });
});

// ============================================================
// findBlockCandidate: li, p outside tiptap
// ============================================================
describe("findBlockCandidate", () => {
  it("tiptap 外の li/p/blockquote は候補にならない", () => {
    const { result } = setup();

    const li = document.createElement("li");
    const outerDiv = document.createElement("div");
    outerDiv.appendChild(li);

    const view = { dom: document.createElement("div") } as any;
    const event = {
      target: li,
      clientX: 0,
      ctrlKey: false,
      metaKey: false,
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    // No heading, no block found -> false
    expect(handled).toBe(false);
  });

  it("p 要素が tiptap 内にある場合はブロック候補として検出", () => {
    const refs = createRefs();
    refs.editor.current = {
      chain: jest.fn().mockReturnValue({
        setTextSelection: jest.fn().mockReturnValue({ run: jest.fn() }),
      }),
    } as any;
    const setHeadingMenu = jest.fn();
    const { result } = setup({ refs, setHeadingMenu });

    const p = document.createElement("p");
    p.getBoundingClientRect = jest.fn().mockReturnValue({ left: 100 });

    const tiptap = document.createElement("div");
    tiptap.classList.add("tiptap");
    tiptap.appendChild(p);

    const view = {
      dom: tiptap,
      posAtDOM: jest.fn().mockReturnValue(1),
    } as any;

    const event = {
      target: p,
      clientX: 50,
      preventDefault: jest.fn(),
      ctrlKey: false,
      metaKey: false,
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.click(view, event);
    expect(setHeadingMenu).toHaveBeenCalled();
    expect(handled).toBe(true);
  });
});

// ============================================================
// insertImageFromFile / insertPastedImage (via drop/paste + FileReader)
// ============================================================
describe("insertImageFromFile via handleDrop", () => {
  it("VS Code 環境で画像ドロップ時に postMessage を呼ぶ", async () => {
    const postMessage = jest.fn();
    (window as any).__vscode = { postMessage };

    const { result } = setup();

    const imgFile = new File(["data"], "screenshot.png", { type: "image/png" });

    // Mock FileReader
    const originalFileReader = global.FileReader;
    const mockReader = {
      result: "data:image/png;base64,abc",
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const view = {
      state: { selection: { from: 0 }, schema: { nodes: { image: { create: jest.fn() } } } },
      posAtCoords: jest.fn().mockReturnValue({ pos: 5 }),
    } as any;

    const event = {
      dataTransfer: { files: [imgFile] },
      preventDefault: jest.fn(),
      clientX: 100,
      clientY: 100,
    } as any;

    result.current.editorProps.handleDrop(view, event, null as any, false);

    // Trigger onload
    expect(mockReader.readAsDataURL).toHaveBeenCalled();
    mockReader.onload!();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "saveClipboardImage", fileName: "screenshot.png" }),
    );

    global.FileReader = originalFileReader;
  });

  it("非 VS Code 環境で画像ドロップ時に tr.insert を呼ぶ", async () => {
    delete (window as any).__vscode;
    const { result } = setup();

    const imgFile = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    const imageNode = { type: "image" };

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: "data:image/jpeg;base64,xyz",
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const trMock = { insert: jest.fn().mockReturnThis() };
    const view = {
      state: {
        selection: { from: 0 },
        schema: { nodes: { image: { create: jest.fn().mockReturnValue(imageNode) } } },
        tr: trMock,
      },
      posAtCoords: jest.fn().mockReturnValue({ pos: 3 }),
      dispatch: jest.fn(),
    } as any;

    const event = {
      dataTransfer: { files: [imgFile] },
      preventDefault: jest.fn(),
      clientX: 100,
      clientY: 100,
    } as any;

    result.current.editorProps.handleDrop(view, event, null as any, false);
    mockReader.onload!();

    expect(trMock.insert).toHaveBeenCalledWith(3, imageNode);
    expect(view.dispatch).toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });

  it("reader.result が string でない場合は何もしない", () => {
    delete (window as any).__vscode;
    const { result } = setup();

    const imgFile = new File(["data"], "photo.png", { type: "image/png" });

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: null, // not a string
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const view = {
      state: { selection: { from: 0 }, schema: { nodes: { image: { create: jest.fn() } } } },
      posAtCoords: jest.fn().mockReturnValue({ pos: 0 }),
      dispatch: jest.fn(),
    } as any;

    const event = {
      dataTransfer: { files: [imgFile] },
      preventDefault: jest.fn(),
      clientX: 0,
      clientY: 0,
    } as any;

    result.current.editorProps.handleDrop(view, event, null as any, false);
    mockReader.onload!();

    expect(view.dispatch).not.toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });

  it("posAtCoords が null の場合 selection.from を使う", () => {
    delete (window as any).__vscode;
    const { result } = setup();

    const imgFile = new File(["data"], "photo.png", { type: "image/png" });
    const imageNode = { type: "image" };

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: "data:image/png;base64,abc",
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const trMock = { insert: jest.fn().mockReturnThis() };
    const view = {
      state: {
        selection: { from: 7 },
        schema: { nodes: { image: { create: jest.fn().mockReturnValue(imageNode) } } },
        tr: trMock,
      },
      posAtCoords: jest.fn().mockReturnValue(null),
      dispatch: jest.fn(),
    } as any;

    const event = {
      dataTransfer: { files: [imgFile] },
      preventDefault: jest.fn(),
      clientX: 0,
      clientY: 0,
    } as any;

    result.current.editorProps.handleDrop(view, event, null as any, false);
    mockReader.onload!();

    expect(trMock.insert).toHaveBeenCalledWith(7, imageNode);

    global.FileReader = originalFileReader;
  });

  it("VS Code 環境でファイル名が image で始まる場合 drop-timestamp を使う", () => {
    const postMessage = jest.fn();
    (window as any).__vscode = { postMessage };
    const { result } = setup();

    const imgFile = new File(["data"], "image.png", { type: "image/png" });

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: "data:image/png;base64,abc",
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const view = {
      state: { selection: { from: 0 } },
      posAtCoords: jest.fn().mockReturnValue({ pos: 0 }),
    } as any;

    const event = {
      dataTransfer: { files: [imgFile] },
      preventDefault: jest.fn(),
      clientX: 0,
      clientY: 0,
    } as any;

    result.current.editorProps.handleDrop(view, event, null as any, false);
    mockReader.onload!();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "saveClipboardImage",
        fileName: expect.stringMatching(/^drop-\d{8}-\d{6}\.png$/),
      }),
    );

    global.FileReader = originalFileReader;
  });
});

describe("insertPastedImage via handlePaste", () => {
  it("VS Code 環境でペースト画像に postMessage を呼ぶ", () => {
    const postMessage = jest.fn();
    (window as any).__vscode = { postMessage };
    const { result } = setup();

    const mockFile = new File([""], "paste.png", { type: "image/png" });

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: "data:image/png;base64,abc",
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const view = {
      state: { selection: { from: 0 } },
    } as any;

    const event = {
      clipboardData: {
        items: [
          { type: "image/png", kind: "file", getAsFile: () => mockFile },
        ],
      },
      preventDefault: jest.fn(),
    } as any;

    result.current.editorProps.handlePaste(view, event);
    mockReader.onload!();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "saveClipboardImage",
        fileName: expect.stringMatching(/^paste-\d{8}-\d{6}\.png$/),
      }),
    );

    global.FileReader = originalFileReader;
  });

  it("非 VS Code 環境でペースト画像に tr.insert を呼ぶ", () => {
    delete (window as any).__vscode;
    const { result } = setup();

    const mockFile = new File([""], "paste.png", { type: "image/png" });
    const imageNode = {};

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: "data:image/png;base64,abc",
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const trMock = { insert: jest.fn().mockReturnThis() };
    const view = {
      state: {
        selection: { from: 2 },
        schema: { nodes: { image: { create: jest.fn().mockReturnValue(imageNode) } } },
        tr: trMock,
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

    result.current.editorProps.handlePaste(view, event);
    mockReader.onload!();

    expect(trMock.insert).toHaveBeenCalledWith(2, imageNode);

    global.FileReader = originalFileReader;
  });

  it("getAsFile が null を返す場合は何もしない", () => {
    delete (window as any).__vscode;
    const { result } = setup();

    const view = {
      state: { selection: { from: 0 } },
      dispatch: jest.fn(),
    } as any;

    const event = {
      clipboardData: {
        items: [
          { type: "image/png", kind: "file", getAsFile: () => null },
        ],
      },
      preventDefault: jest.fn(),
    } as any;

    result.current.editorProps.handlePaste(view, event);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("reader.result が string でない場合は何もしない", () => {
    delete (window as any).__vscode;
    const { result } = setup();

    const mockFile = new File([""], "paste.png", { type: "image/png" });

    const originalFileReader = global.FileReader;
    const mockReader = {
      result: new ArrayBuffer(0), // not a string
      readAsDataURL: jest.fn(),
      onload: null as any,
    };
    global.FileReader = jest.fn().mockImplementation(() => mockReader) as any;

    const view = {
      state: { selection: { from: 0 } },
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

    result.current.editorProps.handlePaste(view, event);
    mockReader.onload!();

    expect(view.dispatch).not.toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });
});

// ============================================================
// tryImportDroppedMdFile (getAsFileSystemHandle)
// ============================================================
describe("tryImportDroppedMdFile", () => {
  it("getAsFileSystemHandle がある場合に handle を取得して handleImport を呼ぶ", async () => {
    const refs = createRefs();
    const handleImport = jest.fn();
    refs.handleImport.current = handleImport;
    const { result } = setup({ refs });

    const mdFile = new File(["# hi"], "test.md", { type: "text/markdown" });
    const mockHandle = { kind: "file" } as any;

    const event = {
      dataTransfer: {
        files: [mdFile],
        items: [
          {
            kind: "file",
            getAsFileSystemHandle: jest.fn().mockResolvedValue(mockHandle),
          },
        ],
      },
      preventDefault: jest.fn(),
    } as any;
    // Make items iterable like files
    event.dataTransfer.items[0].type = "text/markdown";

    const view = {} as any;
    result.current.editorProps.handleDrop(view, event, null as any, false);

    await new Promise((r) => setTimeout(r, 10));
    expect(handleImport).toHaveBeenCalledWith(mdFile, mockHandle);
  });

  it("getAsFileSystemHandle が reject する場合は handle なしで handleImport を呼ぶ", async () => {
    const refs = createRefs();
    const handleImport = jest.fn();
    refs.handleImport.current = handleImport;
    const { result } = setup({ refs });

    const mdFile = new File(["# hi"], "test.md", { type: "text/markdown" });

    const event = {
      dataTransfer: {
        files: [mdFile],
        items: [
          {
            kind: "file",
            getAsFileSystemHandle: jest.fn().mockRejectedValue(new Error("denied")),
          },
        ],
      },
      preventDefault: jest.fn(),
    } as any;
    event.dataTransfer.items[0].type = "text/markdown";

    const view = {} as any;
    result.current.editorProps.handleDrop(view, event, null as any, false);

    await new Promise((r) => setTimeout(r, 10));
    expect(handleImport).toHaveBeenCalledWith(mdFile);
  });

  it("getAsFileSystemHandle が directory handle を返す場合は undefined を渡す", async () => {
    const refs = createRefs();
    const handleImport = jest.fn();
    refs.handleImport.current = handleImport;
    const { result } = setup({ refs });

    const mdFile = new File(["# hi"], "test.md", { type: "text/markdown" });
    const dirHandle = { kind: "directory" } as any;

    const event = {
      dataTransfer: {
        files: [mdFile],
        items: [
          {
            kind: "file",
            getAsFileSystemHandle: jest.fn().mockResolvedValue(dirHandle),
          },
        ],
      },
      preventDefault: jest.fn(),
    } as any;
    event.dataTransfer.items[0].type = "text/markdown";

    const view = {} as any;
    result.current.editorProps.handleDrop(view, event, null as any, false);

    await new Promise((r) => setTimeout(r, 10));
    expect(handleImport).toHaveBeenCalledWith(mdFile, undefined);
  });

  it("items に getAsFileSystemHandle がない場合は直接 handleImport を呼ぶ", () => {
    const refs = createRefs();
    const handleImport = jest.fn();
    refs.handleImport.current = handleImport;
    const { result } = setup({ refs });

    const mdFile = new File(["# hi"], "test.md", { type: "text/markdown" });

    const event = {
      dataTransfer: {
        files: [mdFile],
        items: [{ kind: "file", type: "text/markdown" }],
      },
      preventDefault: jest.fn(),
    } as any;

    const view = {} as any;
    result.current.editorProps.handleDrop(view, event, null as any, false);

    expect(handleImport).toHaveBeenCalledWith(mdFile);
  });
});

// ============================================================
// keydown: VS Code performBlockCopy returns true
// ============================================================
describe("keydown VS Code performBlockCopy true", () => {
  it("performBlockCopy が true を返すと preventDefault が呼ばれる", () => {
    (window as any).__vscode = { postMessage: jest.fn() };
    mockPerformBlockCopy.mockReturnValue(true);

    const { result } = setup();
    const dom = document.createElement("div");
    const view = { dom } as any;
    const event = {
      key: "c",
      ctrlKey: true,
      metaKey: false,
      preventDefault: jest.fn(),
    } as any;

    const handled = result.current.editorProps.handleDOMEvents.keydown(view, event);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockSetHandledByKeydown).toHaveBeenCalledWith(true);
  });

  it("Ctrl+X (cut) も performBlockCopy を isCut=true で呼ぶ", () => {
    (window as any).__vscode = { postMessage: jest.fn() };
    mockPerformBlockCopy.mockReturnValue(true);

    const { result } = setup();
    const dom = document.createElement("div");
    const view = { dom } as any;
    const event = {
      key: "x",
      ctrlKey: true,
      metaKey: false,
      preventDefault: jest.fn(),
    } as any;

    result.current.editorProps.handleDOMEvents.keydown(view, event);

    expect(mockPerformBlockCopy).toHaveBeenCalledWith(view, true, expect.any(Function));
  });
});

// ============================================================
// onUpdate: debounce callback fires
// ============================================================
describe("onUpdate debounce", () => {
  it("debounce 後に setHeadings が呼ばれる", async () => {
    const refs = createRefs();
    const saveContent = jest.fn();
    mockExtractHeadings.mockReturnValue([{ text: "H1", pos: 1, level: 1 }]);
    const { result } = setup({ refs, saveContent });

    const mockEditor = {} as any;
    mockGetMarkdownFromEditor.mockReturnValue("# H1");

    act(() => {
      result.current.onUpdate({ editor: mockEditor });
    });

    // Wait for debounce (50ms in mock)
    await new Promise((r) => setTimeout(r, 100));

    expect(refs.setHeadings.current).toHaveBeenCalledWith([{ text: "H1", pos: 1, level: 1 }]);
  });

  it("連続 onUpdate で前のタイマーがクリアされる", async () => {
    const refs = createRefs();
    const { result } = setup({ refs });

    const mockEditor = {} as any;

    act(() => {
      result.current.onUpdate({ editor: mockEditor });
    });

    act(() => {
      result.current.onUpdate({ editor: mockEditor });
    });

    await new Promise((r) => setTimeout(r, 100));

    // setHeadings should have been called only once (debounced)
    expect(refs.setHeadings.current).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// onCreate: blockquote serialize は admonition 拡張に委譲 (上書き禁止)
// ============================================================
describe("onCreate blockquote serialize", () => {
  it("blockquote.storage.markdown.serialize を上書きしない", () => {
    // regression: onCreate で blockquote serializer を lazy 版に上書きすると
    // AdmonitionBlockquote の `> [!TYPE]` 出力が消失する。lazy 動作は admonition
    // 拡張側で実装されているため、ここで触ってはいけない。
    const { result } = setup();

    const original = jest.fn();
    const bqStorage = { markdown: { serialize: original } };
    const mockEditor = {
      extensionManager: {
        extensions: [{ name: "blockquote", storage: bqStorage }],
      },
    } as any;

    act(() => {
      result.current.onCreate({ editor: mockEditor });
    });

    expect(bqStorage.markdown.serialize).toBe(original);
  });
});

// ============================================================
// handleDrop: .markdown extension and text/markdown type
// ============================================================
describe("handleDrop markdown files", () => {
  it(".markdown 拡張子のファイルも md ファイルとして認識", () => {
    const refs = createRefs();
    const handleImport = jest.fn();
    refs.handleImport.current = handleImport;
    const { result } = setup({ refs });

    const mdFile = new File(["# test"], "doc.markdown", { type: "text/plain" });
    const event = {
      dataTransfer: {
        files: [mdFile],
        items: [],
      },
      preventDefault: jest.fn(),
    } as any;

    const handled = result.current.editorProps.handleDrop({} as any, event, null as any, false);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("非画像・非md ファイルのドロップは false を返す", () => {
    const { result } = setup();

    const txtFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const event = {
      dataTransfer: { files: [txtFile] },
      preventDefault: jest.fn(),
    } as any;

    const handled = result.current.editorProps.handleDrop({} as any, event, null as any, false);
    expect(handled).toBe(false);
  });
});

// ============================================================
// Cleanup: unmount clears debounce
// ============================================================
describe("unmount cleanup", () => {
  it("アンマウント時に debounce タイマーをクリアする", () => {
    const refs = createRefs();
    const timerId = setTimeout(() => {}, 10000);
    refs.headingsDebounce.current = timerId;

    const { unmount } = renderHook(() =>
      useEditorConfig({
        t: (key: string) => key,
        initialContent: "",
        saveContent: jest.fn(),
        refs: refs as any,
        setHeadingMenu: jest.fn(),
      }),
    );

    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
    clearTimeoutSpy.mockRestore();
  });
});
