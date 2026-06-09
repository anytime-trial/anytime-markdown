/**
 * codeBlockChrome.ts — 脱React の code 編集 chrome（vanilla）のテスト。
 * 種別別ツールバー（edit / diagram export / math グラフトグル / delete）・intent・
 * 編集 intent イベント・autoEditOpen・グラフトグルの属性更新を検証する。
 *
 * markdown-viewer barrel は heavy（全 chrome/UI）なので chrome サブモジュールのみ実体を
 * 注入する。重い CodeBlockBlockContent / codeBlockOverlayHelpers は軽量 stub に差し替える。
 */
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/blockChrome"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/vanillaToolbar"),
}));

jest.mock("../components/codeblock/CodeBlockBlockContent", () => ({
  CODE_BLOCK_EDIT_INTENT_EVENT: "md-codeblock-edit-intent",
  classifyCodeBlock: (lang: unknown) =>
    lang === "math" ? "math"
    : lang === "mermaid" || lang === "plantuml" ? "diagram"
    : lang === "html" ? "html"
    : typeof lang === "string" && lang.startsWith("embed") ? "embed"
    : "regular",
}));

jest.mock("../components/codeblock/codeBlockOverlayHelpers", () => ({
  applySelectionCollapse: jest.fn(),
  codeBlockToolbarLabel: (kind: string, lang: string) =>
    kind === "diagram" ? (lang === "mermaid" ? "mermaid" : "plantuml")
    : kind === "math" ? "Math"
    : kind === "html" ? "htmlPreview"
    : kind === "embed" ? "Embed"
    : lang ? `Code (${lang})` : "Code",
}));

import { createCodeBlockChrome } from "../components/codeblock/codeBlockChrome";

type Attrs = Record<string, unknown>;
interface MockNode { type: { name: string }; nodeSize: number; attrs: Attrs }

function makeEditor() {
  const listeners: Record<string, Array<() => void>> = {};
  const chainCalls: Array<(arg: { tr: any }) => void> = [];
  let selection: any = { node: null, from: -1, $from: null };
  const editor: any = {
    isEditable: true,
    state: {
      get selection() { return selection; },
      doc: { nodeAt: (p: number) => nodeAtMap.get(p) ?? null },
    },
    view: {
      dom: document.createElement("div"),
      nodeDOM: () => {
        const el = document.createElement("div");
        el.getBoundingClientRect = () => ({ top: 1, left: 2, width: 100, height: 40 }) as DOMRect;
        return el;
      },
    },
    chain: () => {
      const c: any = {
        focus: () => c,
        command: (fn: (arg: { tr: any }) => void) => { chainCalls.push(fn); return c; },
        run: () => true,
      };
      return c;
    },
    on(evt: string, fn: () => void) { (listeners[evt] ??= []).push(fn); },
    off(evt: string, fn: () => void) { listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn); },
  };
  const nodeAtMap = new Map<number, MockNode>();
  const select = (language: string, attrs: Attrs, pos: number) => {
    const node: MockNode = { type: { name: "codeBlock" }, nodeSize: 1, attrs: { language, ...attrs } };
    nodeAtMap.set(pos, node);
    selection = {
      node: undefined,
      from: pos,
      $from: { depth: 1, node: () => ({ type: { name: "codeBlock" } }), before: () => pos },
    };
    (listeners.transaction ?? []).forEach((f) => f());
  };
  return { editor, chainCalls, select, dom: editor.view.dom as HTMLElement };
}

function cb(over: Partial<Record<string, unknown>> = {}) {
  return {
    t: (k: string) => k,
    isGraphHidden: () => false,
    onSelect: jest.fn(),
    onEdit: jest.fn(),
    onExport: jest.fn(),
    onExportSource: jest.fn(),
    onDelete: jest.fn(),
    ...over,
  } as any;
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe("createCodeBlockChrome", () => {
  afterEach(() => {
    document.querySelectorAll("[data-vanilla-block-chrome]").forEach((el) => el.remove());
  });

  it("regular 選択でツールバー表示・onSelect 通知・edit/delete のみ", () => {
    const { editor, select } = makeEditor();
    const c = cb();
    const destroy = createCodeBlockChrome(editor, c);
    select("js", {}, 5);

    expect(q("[data-block-toolbar]")).toBeTruthy();
    expect(c.onSelect).toHaveBeenCalledWith(5, expect.any(Object));
    expect(q('button[aria-label="edit"]')).toBeTruthy();
    expect(q('button[aria-label="delete"]')).toBeTruthy();
    expect(q('button[aria-label="exportPng"]')).toBeNull();
    destroy();
  });

  it("diagram(mermaid) で PNG/ソース export ボタンを出し intent を発火する", () => {
    const { editor, select } = makeEditor();
    const c = cb();
    const destroy = createCodeBlockChrome(editor, c);
    select("mermaid", {}, 5);

    q('button[aria-label="exportPng"]')!.click();
    q('button[aria-label="exportMmd"]')!.click();
    expect(c.onExport).toHaveBeenCalledWith(5);
    expect(c.onExportSource).toHaveBeenCalledWith(5);
    destroy();
  });

  it("math はグラフトグルを出す（hideGraph=true なら出さない）", () => {
    const { editor, select } = makeEditor();
    const destroy = createCodeBlockChrome(editor, cb());
    select("math", { graphEnabled: false }, 5);
    expect(q('button[aria-label="showGraph"]')).toBeTruthy();
    destroy();

    const e2 = makeEditor();
    const d2 = createCodeBlockChrome(e2.editor, cb({ isGraphHidden: () => true }));
    e2.select("math", { graphEnabled: false }, 5);
    expect(q('button[aria-label="showGraph"]')).toBeNull();
    d2();
  });

  it("グラフトグルで graphEnabled を反転する setBlockAttrs を発火する", () => {
    const { editor, select, chainCalls } = makeEditor();
    const destroy = createCodeBlockChrome(editor, cb());
    select("math", { graphEnabled: false }, 5);
    q('button[aria-label="showGraph"]')!.click();
    const tr = { setNodeAttribute: jest.fn() };
    chainCalls[chainCalls.length - 1]({ tr });
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, "graphEnabled", true);
    destroy();
  });

  it("edit / delete intent と編集 intent イベントを発火する", () => {
    const { editor, select, dom } = makeEditor();
    const c = cb();
    const destroy = createCodeBlockChrome(editor, c);
    select("js", {}, 5);

    q('button[aria-label="edit"]')!.click();
    q('button[aria-label="delete"]')!.click();
    expect(c.onEdit).toHaveBeenCalledWith(5);
    expect(c.onDelete).toHaveBeenCalledWith(5);

    c.onEdit.mockClear();
    dom.dispatchEvent(new CustomEvent("md-codeblock-edit-intent", { bubbles: true }));
    expect(c.onEdit).toHaveBeenCalledWith(5);
    destroy();
  });

  it("autoEditOpen(preview 種別)で編集を開き属性をクリアする", () => {
    const { editor, select, chainCalls } = makeEditor();
    const c = cb();
    const destroy = createCodeBlockChrome(editor, c);
    select("mermaid", { autoEditOpen: true }, 7);

    expect(c.onEdit).toHaveBeenCalledWith(7);
    const tr = { setNodeAttribute: jest.fn() };
    chainCalls[chainCalls.length - 1]({ tr });
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(7, "autoEditOpen", false);
    destroy();
  });
});
