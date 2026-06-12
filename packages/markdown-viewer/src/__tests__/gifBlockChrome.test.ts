/**
 * gifBlockChrome.ts — 脱React の gif 編集 chrome（vanilla）のテスト。
 * 選択追従 → ツールバー描画 → edit / delete / record intent 発火・autoEditOpen を検証する。
 * 重い editor は mock（transaction emitter）でスタブ化する。
 */
import { GIF_RECORD_INTENT_EVENT } from "../components/GifBlockContent";
import { createGifBlockChrome } from "../chrome/gifBlockChrome";

type Attrs = Record<string, unknown>;
interface MockNode {
  type: { name: string };
  nodeSize: number;
  attrs: Attrs;
}

function makeEditor() {
  const listeners: Record<string, Array<() => void>> = {};
  const commandSink: Array<(arg: { tr: any; state: any }) => void> = [];
  const nodeAtMap = new Map<number, MockNode>();
  let selection: { node: MockNode | null; from: number; $from: null } = {
    node: null,
    from: -1,
    $from: null,
  };
  const dom = document.createElement("div");

  const chain = () => {
    const c: any = {
      focus: () => c,
      command: (fn: (arg: { tr: any; state: any }) => void) => {
        commandSink.push(fn);
        return c;
      },
      run: () => true,
    };
    return c;
  };

  const editor: any = {
    isEditable: true,
    state: {
      get selection() {
        return selection;
      },
      doc: { nodeAt: (p: number) => nodeAtMap.get(p) ?? null },
    },
    view: {
      dom,
      nodeDOM: () => {
        const el = document.createElement("div");
        el.getBoundingClientRect = () =>
          ({ top: 10, left: 20, width: 100, height: 50 }) as DOMRect;
        return el;
      },
    },
    chain,
    on(evt: string, fn: () => void) {
      (listeners[evt] ??= []).push(fn);
    },
    off(evt: string, fn: () => void) {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
    },
  };

  const emit = (evt: string) => (listeners[evt] ?? []).forEach((f) => f());
  const select = (node: MockNode | null, pos: number) => {
    selection = { node, from: pos, $from: null };
    if (node && pos >= 0) nodeAtMap.set(pos, node);
    emit("transaction");
  };

  return { editor, commandSink, dom, select };
}

const gifNode: MockNode = {
  type: { name: "gifBlock" },
  nodeSize: 1,
  attrs: { src: "x.gif", gifSettings: null, autoEditOpen: false },
};

function defaultCallbacks() {
  return {
    t: (k: string) => k,
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onRecord: jest.fn(),
  };
}

function getToolbar(): HTMLElement | null {
  return document.querySelector("[data-block-toolbar]");
}

describe("createGifBlockChrome", () => {
  afterEach(() => {
    document.querySelectorAll("[data-vanilla-block-chrome]").forEach((el) => el.remove());
  });

  it("選択中の gifBlock でツールバーを表示し、解除で隠す", () => {
    const { editor, select } = makeEditor();
    const cb = defaultCallbacks();
    const destroy = createGifBlockChrome(editor, cb);

    const anchor = document.querySelector("[data-vanilla-block-chrome]") as HTMLElement;
    expect(anchor.style.display).toBe("none"); // 初期未選択

    select(gifNode, 5);
    expect(anchor.style.display).toBe("");
    expect(getToolbar()).toBeTruthy();
    expect(getToolbar()?.getAttribute("aria-label")).toBe("GIF");

    select(null, -1);
    expect(anchor.style.display).toBe("none");

    destroy();
    expect(document.querySelector("[data-vanilla-block-chrome]")).toBeNull();
  });

  it("edit クリックで現在ノードの src を添えて onEdit を発火する", () => {
    const { editor, select } = makeEditor();
    const cb = defaultCallbacks();
    const destroy = createGifBlockChrome(editor, cb);
    select(gifNode, 5);

    const editBtn = document.querySelector('button[aria-label="edit"]') as HTMLButtonElement;
    editBtn.click();
    expect(cb.onEdit).toHaveBeenCalledWith(5, { src: "x.gif", settings: null });
    destroy();
  });

  it("delete クリックで onDelete を pos 付きで発火する", () => {
    const { editor, select } = makeEditor();
    const cb = defaultCallbacks();
    const destroy = createGifBlockChrome(editor, cb);
    select(gifNode, 5);

    const delBtn = document.querySelector('button[aria-label="delete"]') as HTMLButtonElement;
    delBtn.click();
    expect(cb.onDelete).toHaveBeenCalledWith(5);
    destroy();
  });

  it("placeholder の録画 intent イベントで onRecord を発火する", () => {
    const { editor, dom } = makeEditor();
    const cb = defaultCallbacks();
    const destroy = createGifBlockChrome(editor, cb);

    dom.dispatchEvent(
      new CustomEvent(GIF_RECORD_INTENT_EVENT, { bubbles: true, detail: { pos: 3 } }),
    );
    expect(cb.onRecord).toHaveBeenCalledWith(3);
    destroy();
  });

  it("autoEditOpen の gifBlock 選択で録画を開き、属性を即クリアする", () => {
    const { editor, select, commandSink } = makeEditor();
    const cb = defaultCallbacks();
    const destroy = createGifBlockChrome(editor, cb);

    const autoNode: MockNode = {
      type: { name: "gifBlock" },
      nodeSize: 1,
      attrs: { src: "", gifSettings: null, autoEditOpen: true },
    };
    select(autoNode, 7);

    expect(cb.onRecord).toHaveBeenCalledWith(7);
    // setBlockAttrs により autoEditOpen=false の command が積まれる
    expect(commandSink.length).toBeGreaterThan(0);
    const tr = { setNodeAttribute: jest.fn() };
    commandSink[commandSink.length - 1]({ tr, state: editor.state });
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(7, "autoEditOpen", false);
    destroy();
  });

  it("destroy 後はツールバーも record リスナも除去される", () => {
    const { editor, dom } = makeEditor();
    const cb = defaultCallbacks();
    const destroy = createGifBlockChrome(editor, cb);
    destroy();

    expect(getToolbar()).toBeNull();
    dom.dispatchEvent(
      new CustomEvent(GIF_RECORD_INTENT_EVENT, { bubbles: true, detail: { pos: 3 } }),
    );
    expect(cb.onRecord).not.toHaveBeenCalled();
  });
});
