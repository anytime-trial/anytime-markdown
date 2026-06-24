/**
 * tableBlockChrome.ts — 脱React の table 編集 chrome（vanilla）のテスト。
 * 選択追従 → ツールバー描画 → edit/delete intent・編集中サプレッション（setEditing）を検証する。
 * 列/行の追加削除・整列・入れ替えは編集画面（SpreadsheetGrid）へ集約済みで、
 * インラインツールバーには描画しないことも回帰ガードする。editor は mock。
 */
import { createTableBlockChrome } from "../chrome/tableBlockChrome";

function makeEditor() {
  const listeners: Record<string, Array<() => void>> = {};
  let selection: any = { node: null, from: -1, $from: null };
  const chain = () => {
    const c: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "run") return () => true;
          return () => c;
        },
      },
    );
    return c;
  };
  const editor: any = {
    isEditable: true,
    state: {
      get selection() {
        return selection;
      },
      doc: { nodeAt: () => ({ type: { name: "table" }, nodeSize: 1, attrs: {} }) },
    },
    view: {
      dom: document.createElement("div"),
      nodeDOM: () => {
        const el = document.createElement("div");
        el.getBoundingClientRect = () =>
          ({ top: 10, left: 20, width: 200, height: 80 }) as DOMRect;
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
  const selectTable = (pos: number) => {
    selection = {
      node: undefined,
      from: pos,
      $from: {
        depth: 2,
        node: (d: number) => ({ type: { name: d === 1 ? "table" : "tableRow" } }),
        before: (d: number) => (d === 1 ? pos : 0),
      },
    };
    (listeners.transaction ?? []).forEach((f) => f());
  };
  const deselect = () => {
    selection = { node: null, from: -1, $from: null };
    (listeners.transaction ?? []).forEach((f) => f());
  };
  return { editor, selectTable, deselect };
}

function cb() {
  return { t: (k: string) => k, onEdit: jest.fn(), onDelete: jest.fn() };
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe("createTableBlockChrome", () => {
  afterEach(() => {
    document.querySelectorAll("[data-vanilla-block-chrome]").forEach((el) => el.remove());
  });

  it("table 選択でツールバー表示、解除で非表示", () => {
    const { editor, selectTable, deselect } = makeEditor();
    const h = createTableBlockChrome(editor, cb());
    const anchor = q("[data-vanilla-block-chrome]")!;
    expect(anchor.style.display).toBe("none");

    selectTable(5);
    expect(anchor.style.display).toBe("");
    expect(q("[data-block-toolbar]")?.getAttribute("aria-label")).toBe("tableLabel");

    deselect();
    expect(anchor.style.display).toBe("none");
    h.destroy();
    expect(q("[data-vanilla-block-chrome]")).toBeNull();
  });

  it("列/行操作・整列・入れ替えアイコンはインラインに描画しない（編集画面へ集約）", () => {
    const { editor, selectTable } = makeEditor();
    const h = createTableBlockChrome(editor, cb());
    selectTable(5);

    for (const label of [
      "addColumn",
      "removeColumn",
      "addRow",
      "removeRow",
      "alignLeft",
      "alignCenter",
      "alignRight",
      "moveRowUp",
      "moveRowDown",
      "moveColLeft",
      "moveColRight",
    ]) {
      expect(q(`button[aria-label="${label}"]`)).toBeNull();
    }
    // 編集・削除のインライン intent は残す。
    expect(q('button[aria-label="edit"]')).not.toBeNull();
    expect(q('button[aria-label="delete"]')).not.toBeNull();
    h.destroy();
  });

  it("edit / delete intent を pos 付きで発火する", () => {
    const { editor, selectTable } = makeEditor();
    const c = cb();
    const h = createTableBlockChrome(editor, c);
    selectTable(5);
    q('button[aria-label="edit"]')!.click();
    q('button[aria-label="delete"]')!.click();
    expect(c.onEdit).toHaveBeenCalledWith(5);
    expect(c.onDelete).toHaveBeenCalledWith(5);
    h.destroy();
  });

  it("setEditing(true) でツールバーを抑制し、false で復帰する", () => {
    const { editor, selectTable } = makeEditor();
    const h = createTableBlockChrome(editor, cb());
    selectTable(5);
    const anchor = q("[data-vanilla-block-chrome]")!;
    expect(anchor.style.display).toBe("");

    h.setEditing(true);
    expect(anchor.style.display).toBe("none");
    h.setEditing(false);
    expect(anchor.style.display).toBe("");
    h.destroy();
  });
});
