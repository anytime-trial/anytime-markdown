/**
 * imageBlockChrome.ts — 脱React の image 編集 chrome（vanilla）のテスト。
 * 選択追従 → ツールバー描画 → editCrop / url / annotate / delete intent・
 * 警告/注釈アクティブの動的更新を検証する。editor は mock。
 */
import { createImageBlockChrome } from "../chrome/imageBlockChrome";

type Attrs = Record<string, unknown>;
interface MockNode {
  type: { name: string };
  nodeSize: number;
  attrs: Attrs;
}

function makeEditor(storage: Record<string, Record<string, unknown>> = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const nodeAtMap = new Map<number, MockNode>();
  let selection: { node: MockNode | null; from: number; $from: null } = {
    node: null,
    from: -1,
    $from: null,
  };
  const editor: any = {
    isEditable: true,
    storage,
    state: {
      get selection() {
        return selection;
      },
      doc: { nodeAt: (p: number) => nodeAtMap.get(p) ?? null },
    },
    view: {
      dom: document.createElement("div"),
      nodeDOM: () => {
        const el = document.createElement("div");
        el.getBoundingClientRect = () =>
          ({ top: 10, left: 20, width: 100, height: 50 }) as DOMRect;
        return el;
      },
    },
    chain: () => {
      const c: any = { focus: () => c, command: () => c, run: () => true };
      return c;
    },
    on(evt: string, fn: () => void) {
      (listeners[evt] ??= []).push(fn);
    },
    off(evt: string, fn: () => void) {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
    },
  };
  const select = (node: MockNode | null, pos: number) => {
    selection = { node, from: pos, $from: null };
    if (node && pos >= 0) nodeAtMap.set(pos, node);
    (listeners.transaction ?? []).forEach((f) => f());
  };
  return { editor, select };
}

function imageNode(attrs: Attrs): MockNode {
  return { type: { name: "image" }, nodeSize: 1, attrs };
}

function callbacks() {
  return {
    t: (k: string) => k,
    onEditCrop: jest.fn(),
    onAnnotate: jest.fn(),
    onDelete: jest.fn(),
  };
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe("createImageBlockChrome", () => {
  afterEach(() => {
    document.querySelectorAll("[data-vanilla-block-chrome]").forEach((el) => el.remove());
  });

  it("image 選択でツールバー表示、解除で非表示", () => {
    const { editor, select } = makeEditor();
    const destroy = createImageBlockChrome(editor, callbacks());
    const anchor = q("[data-vanilla-block-chrome]")!;
    expect(anchor.style.display).toBe("none");

    select(imageNode({ src: "a.png", alt: "x" }), 5);
    expect(anchor.style.display).toBe("");
    expect(q("[data-block-toolbar]")?.getAttribute("aria-label")).toBe("image");

    select(null, -1);
    expect(anchor.style.display).toBe("none");
    destroy();
    expect(q("[data-vanilla-block-chrome]")).toBeNull();
  });

  it("alt 未設定で警告表示、alt ありで非表示", () => {
    const { editor, select } = makeEditor();
    const destroy = createImageBlockChrome(editor, callbacks());

    select(imageNode({ src: "a.png", alt: "" }), 5);
    expect(q("[data-image-alt-warning]")?.style.display).toBe("inline-flex");

    select(imageNode({ src: "a.png", alt: "desc" }), 9);
    expect(q("[data-image-alt-warning]")?.style.display).toBe("none");
    destroy();
  });

  it("注釈ありで annotate ボタンが primary 色になる", () => {
    const { editor, select } = makeEditor();
    const cb = callbacks();
    const destroy = createImageBlockChrome(editor, cb);

    const annJson = JSON.stringify([{ id: "1", tool: "rect", points: [] }]);
    select(imageNode({ src: "a.png", alt: "x", annotations: annJson }), 5);
    const annotateBtn = q('button[aria-label="annotate"]')!;
    expect(annotateBtn.style.color).toContain("primary-main");
    destroy();
  });

  it("editCrop / annotate / delete intent を pos 付きで発火する", () => {
    const { editor, select } = makeEditor();
    const cb = callbacks();
    const destroy = createImageBlockChrome(editor, cb);
    select(imageNode({ src: "a.png", alt: "x", annotations: null }), 5);

    q('button[aria-label="edit"]')!.click();
    expect(cb.onEditCrop).toHaveBeenCalledWith(5, { src: "a.png" });

    q('button[aria-label="annotate"]')!.click();
    expect(cb.onAnnotate).toHaveBeenCalledWith(5, { src: "a.png", annotations: null });

    q('button[aria-label="delete"]')!.click();
    expect(cb.onDelete).toHaveBeenCalledWith(5);
    destroy();
  });

  it("url ボタンは editor.storage.image.onEditImage へ委譲する", () => {
    const onEditImage = jest.fn();
    const { editor, select } = makeEditor({ image: { onEditImage } });
    const destroy = createImageBlockChrome(editor, callbacks());
    select(imageNode({ src: "a.png", alt: "x" }), 5);

    q('button[aria-label="imageUrl"]')!.click();
    expect(onEditImage).toHaveBeenCalledWith({ pos: 5, src: "a.png", alt: "x" });
    destroy();
  });
});
