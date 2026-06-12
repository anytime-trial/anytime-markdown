/**
 * components-vanilla/OutlinePanel.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する。React/JSX は使わない。
 * パネル系のため el は self-append せず、呼び元（テスト）が必要なら body へ append する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証せず el.style.cssText を見る。
 * - var(--am-...) を含む文字列はそのまま cssText に残る前提で contain で検証する。
 * - currentColor は jsdom が小文字化するため round-trip 検証しない。
 * - scrollIntoView 等は本コンポーネントでは未使用（クリックは onOutlineClick(pos) コールバック）。
 *
 * editor は mock（state.doc.descendants / on / off スタブ）。extractHeadings(editor) が
 * descendants を走査するため、ノード配列を descendants でエミュレートする。
 */

import {
  createOutlinePanel,
  type CreateOutlinePanelOptions,
} from "../components-vanilla/OutlinePanel";

const t = (key: string): string => key;

interface MockNode {
  typeName: string;
  level?: number;
  text?: string;
  language?: string;
  alt?: string;
}

/** descendants コールバック用に MockNode を ProseMirror ノード風へ変換する。 */
function toPmNode(n: MockNode): any {
  return {
    type: { name: n.typeName },
    attrs: { level: n.level, language: n.language, alt: n.alt },
    textContent: n.text ?? "",
  };
}

/** editor mock。nodes を descendants で順に渡す（pos は index を流用）。emit でイベント発火。 */
function makeEditor(initNodes: MockNode[] = []) {
  const listeners: Record<string, Array<() => void>> = {};
  let nodes = initNodes;
  const setFoldedHeadings = jest.fn(() => true);
  const editor: any = {
    state: {
      doc: {
        descendants(cb: (node: any, pos: number) => boolean | void) {
          nodes.forEach((n, i) => {
            cb(toPmNode(n), i * 10);
          });
        },
      },
    },
    commands: { setFoldedHeadings },
    on(evt: string, fn: () => void) {
      (listeners[evt] ??= []).push(fn);
    },
    off(evt: string, fn: () => void) {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
    },
  };
  return {
    editor,
    setFoldedHeadings,
    setNodes: (next: MockNode[]) => {
      nodes = next;
    },
    emit: (evt: string) => (listeners[evt] ?? []).forEach((f) => f()),
    listenerCount: (evt: string) => (listeners[evt] ?? []).length,
  };
}

function baseOpts(over: Partial<CreateOutlinePanelOptions> = {}): CreateOutlinePanelOptions {
  return {
    editor: makeEditor().editor,
    t,
    outlineWidth: 240,
    editorHeight: 600,
    onOutlineClick: () => {},
    ...over,
  };
}

/** パネル内の見出しラベル行（role="button" のラベル div）を取得する。 */
function labels(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll('[role="button"][tabindex="0"]')] as HTMLElement[];
}

const HEADINGS: MockNode[] = [
  { typeName: "heading", level: 1, text: "Intro" },
  { typeName: "heading", level: 2, text: "Background" },
  { typeName: "heading", level: 2, text: "Method" },
];

describe("createOutlinePanel", () => {
  describe("生成 / 構造", () => {
    it("navigation ロールの Paper とリサイズハンドルを持つ", () => {
      const handle = createOutlinePanel(baseOpts());
      const nav = handle.el.querySelector('[role="navigation"]') as HTMLElement;
      expect(nav).toBeTruthy();
      expect(nav.getAttribute("aria-label")).toBe("outlineNavigation");
      expect(handle.el.querySelector('[role="separator"]')).toBeTruthy();
      handle.destroy();
    });

    it("幅を style に反映する", () => {
      const handle = createOutlinePanel(baseOpts({ outlineWidth: 300 }));
      const nav = handle.el.querySelector('[role="navigation"]') as HTMLElement;
      expect(nav.style.width).toBe("300px");
      expect(nav.style.minWidth).toBe("300px");
      expect(nav.style.maxWidth).toBe("300px");
      expect(nav.style.maxHeight).toBe("600px");
      handle.destroy();
    });

    it("hideResize でリサイズハンドルを出さない", () => {
      const handle = createOutlinePanel(baseOpts({ hideResize: true }));
      expect(handle.el.querySelector('[role="separator"]')).toBeNull();
      handle.destroy();
    });

    it("見出しがないとき noHeadings を表示する", () => {
      const handle = createOutlinePanel(baseOpts());
      expect(handle.el.textContent).toContain("noHeadings");
      handle.destroy();
    });

    it("見出しタイトル（outline）を表示する", () => {
      const handle = createOutlinePanel(baseOpts());
      const title = handle.el.querySelector("#outline-panel-title") as HTMLElement;
      expect(title.textContent).toBe("outline");
      handle.destroy();
    });
  });

  describe("見出し集計", () => {
    it("editor から見出しを集計して行を描画する", () => {
      const m = makeEditor(HEADINGS);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      const ls = labels(handle.el);
      expect(ls.map((l) => l.textContent)).toEqual(["Intro", "Background", "Method"]);
      handle.destroy();
    });

    it("空テキストの見出しは (empty) と表示する", () => {
      const m = makeEditor([{ typeName: "heading", level: 1, text: "" }]);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      expect(labels(handle.el)[0].textContent).toBe("(empty)");
      handle.destroy();
    });

    it("update イベントで見出しを再集計する", () => {
      const m = makeEditor([]);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      expect(handle.el.textContent).toContain("noHeadings");
      m.setNodes(HEADINGS);
      m.emit("update");
      expect(labels(handle.el).map((l) => l.textContent)).toEqual(["Intro", "Background", "Method"]);
      handle.destroy();
    });

    it("transaction イベントでも再集計する", () => {
      const m = makeEditor([]);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      m.setNodes([{ typeName: "heading", level: 1, text: "X" }]);
      m.emit("transaction");
      expect(labels(handle.el).map((l) => l.textContent)).toEqual(["X"]);
      handle.destroy();
    });
  });

  describe("ブロック表示トグル", () => {
    const MIXED: MockNode[] = [
      { typeName: "heading", level: 1, text: "H" },
      { typeName: "codeBlock", language: "ts" },
      { typeName: "table" },
      { typeName: "image", alt: "Pic" },
    ];

    it("初期はブロックを隠す（heading のみ）", () => {
      const m = makeEditor(MIXED);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      // ブロック行も label を持つが Collapse(unmountOnExit) で in=false のため inner 未マウント。
      const visible = labels(handle.el).map((l) => l.textContent);
      expect(visible).toContain("H");
      expect(visible).not.toContain("ts");
      handle.destroy();
    });

    it("トグルでブロックを表示する", () => {
      const m = makeEditor(MIXED);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      const toggle = handle.el.querySelector('[aria-label="outlineShowBlocks"]') as HTMLButtonElement;
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      toggle.click();
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      const visible = labels(handle.el).map((l) => l.textContent);
      expect(visible).toEqual(expect.arrayContaining(["H", "ts", "Table", "Pic"]));
      handle.destroy();
    });
  });

  describe("クリックでスクロール要求", () => {
    it("ラベルクリックで onOutlineClick(pos) を呼ぶ", () => {
      const m = makeEditor(HEADINGS);
      const clicks: number[] = [];
      const handle = createOutlinePanel(baseOpts({ editor: m.editor, onOutlineClick: (p) => clicks.push(p) }));
      labels(handle.el)[1].click();
      // pos は index*10（mock）。2 番目の見出しは index 1 → pos 10。
      expect(clicks).toEqual([10]);
      handle.destroy();
    });
  });

  describe("折り畳み", () => {
    it("fold ボタンで配下の見出しを隠す", () => {
      // H1 配下に H2 が 2 つ → H1 を fold すると H2 が hidden（Collapse in=false）になる。
      const m = makeEditor(HEADINGS);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      // 先頭 H1 の fold ボタンを押す。fold トグルで list が再描画されボタンは作り直されるため、
      // click 後は再取得して aria-expanded を検証する（古い参照は detached になる）。
      (handle.el.querySelectorAll('[aria-expanded]')[0] as HTMLButtonElement).click();
      expect(
        (handle.el.querySelectorAll('[aria-expanded]')[0] as HTMLElement).getAttribute("aria-expanded"),
      ).toBe("false");
      // 配下の Collapse が data-open=false になっている。
      const collapses = [...handle.el.querySelectorAll("[data-am-collapse]")] as HTMLElement[];
      // 1 番目（Intro 自身）は open、2・3 番目（配下 H2）は close。
      expect(collapses[1].getAttribute("data-open")).toBe("false");
      expect(collapses[2].getAttribute("data-open")).toBe("false");
      handle.destroy();
    });

    it("fold-all / unfold-all トグル", () => {
      const m = makeEditor(HEADINGS);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      const foldAll = handle.el.querySelector('[aria-label="foldAll"]') as HTMLButtonElement;
      expect(foldAll).toBeTruthy();
      foldAll.click();
      // fold-all 後はラベルが unfoldAll に変わる。
      expect(handle.el.querySelector('[aria-label="unfoldAll"]')).toBeTruthy();
      // unfold は段階展開（旧 useOutline parity）: 1 回目で H1 のみ解除 → まだ unfoldAll。
      (handle.el.querySelector('[aria-label="unfoldAll"]') as HTMLButtonElement).click();
      expect(handle.el.querySelector('[aria-label="unfoldAll"]')).toBeTruthy();
      // 2 回目で H2 も解除され foldAll へ戻る。
      (handle.el.querySelector('[aria-label="unfoldAll"]') as HTMLButtonElement).click();
      expect(handle.el.querySelector('[aria-label="foldAll"]')).toBeTruthy();
      handle.destroy();
    });

    it("見出しが無いとき fold-all ボタンを隠す", () => {
      const handle = createOutlinePanel(baseOpts());
      const foldAll = handle.el.querySelector('[aria-label="foldAll"]') as HTMLElement;
      expect(foldAll.style.display).toBe("none");
      handle.destroy();
    });
  });

  describe("削除 / 章番号 / 並べ替えコールバック", () => {
    it("onOutlineDelete 指定時に各行へ削除ボタンを置く", () => {
      const m = makeEditor(HEADINGS);
      const deletes: Array<[number, string]> = [];
      const handle = createOutlinePanel(
        baseOpts({ editor: m.editor, onOutlineDelete: (pos, kind) => deletes.push([pos, kind]) }),
      );
      const delBtns = handle.el.querySelectorAll('[aria-label^="delete "]');
      expect(delBtns.length).toBe(3);
      (delBtns[0] as HTMLButtonElement).click();
      expect(deletes).toEqual([[0, "heading"]]);
      handle.destroy();
    });

    it("章番号ボタンは onInsert/onRemove 指定時のみ出す", () => {
      const inserts: number[] = [];
      const removes: number[] = [];
      const handle = createOutlinePanel(
        baseOpts({
          onInsertSectionNumbers: () => inserts.push(1),
          onRemoveSectionNumbers: () => removes.push(1),
        }),
      );
      const ins = handle.el.querySelector('[aria-label="insertSectionNumbers"]') as HTMLButtonElement;
      const rem = handle.el.querySelector('[aria-label="removeSectionNumbers"]') as HTMLButtonElement;
      expect(ins).toBeTruthy();
      expect(rem).toBeTruthy();
      ins.click();
      rem.click();
      expect(inserts.length).toBe(1);
      expect(removes.length).toBe(1);
      handle.destroy();
    });

    it("章番号コールバック未指定時はボタンを出さない", () => {
      const handle = createOutlinePanel(baseOpts());
      expect(handle.el.querySelector('[aria-label="insertSectionNumbers"]')).toBeNull();
      expect(handle.el.querySelector('[aria-label="removeSectionNumbers"]')).toBeNull();
      handle.destroy();
    });

    it("onHeadingDragEnd 指定時に行を draggable にする", () => {
      const m = makeEditor(HEADINGS);
      const handle = createOutlinePanel(
        baseOpts({ editor: m.editor, onHeadingDragEnd: () => {} }),
      );
      const rows = handle.el.querySelectorAll(".am-outline-item");
      expect((rows[0] as HTMLElement).draggable).toBe(true);
      handle.destroy();
    });

    it("Alt+ArrowDown で onHeadingDragEnd(from, to) を呼ぶ", () => {
      const m = makeEditor(HEADINGS);
      const moves: Array<[number, number]> = [];
      const handle = createOutlinePanel(
        baseOpts({ editor: m.editor, onHeadingDragEnd: (f, to) => moves.push([f, to]) }),
      );
      const label = labels(handle.el)[0];
      label.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
      );
      expect(moves).toEqual([[0, 1]]);
      handle.destroy();
    });
  });

  describe("リサイズ", () => {
    it("mousedown で onResizeStart を呼ぶ", () => {
      const starts: number[] = [];
      const handle = createOutlinePanel(baseOpts({ onResizeStart: () => starts.push(1) }));
      const sep = handle.el.querySelector('[role="separator"]') as HTMLElement;
      sep.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(starts.length).toBe(1);
      handle.destroy();
    });

    it("ArrowRight/ArrowLeft で onWidthChange を呼ぶ（clamp あり）", () => {
      const widths: number[] = [];
      const handle = createOutlinePanel(
        baseOpts({ outlineWidth: 240, onWidthChange: (w) => widths.push(w) }),
      );
      const sep = handle.el.querySelector('[role="separator"]') as HTMLElement;
      sep.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      sep.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      expect(widths).toEqual([260, 220]);
      handle.destroy();
    });

    it("aria-valuenow/min/max を持つ", () => {
      const handle = createOutlinePanel(baseOpts({ outlineWidth: 240 }));
      const sep = handle.el.querySelector('[role="separator"]') as HTMLElement;
      expect(sep.getAttribute("aria-valuenow")).toBe("240");
      expect(sep.getAttribute("aria-valuemin")).toBe("150");
      expect(sep.getAttribute("aria-valuemax")).toBe("500");
      handle.destroy();
    });
  });

  describe("update", () => {
    it("幅 / 高さの更新を反映し aria-valuenow も更新する", () => {
      const handle = createOutlinePanel(baseOpts({ outlineWidth: 240 }));
      handle.update({ outlineWidth: 320, editorHeight: 800 });
      const nav = handle.el.querySelector('[role="navigation"]') as HTMLElement;
      expect(nav.style.width).toBe("320px");
      expect(nav.style.maxHeight).toBe("800px");
      const sep = handle.el.querySelector('[role="separator"]') as HTMLElement;
      expect(sep.getAttribute("aria-valuenow")).toBe("320");
      handle.destroy();
    });
  });

  describe("destroy のクリーンアップ", () => {
    it("editor の update / transaction listener を解除する", () => {
      const m = makeEditor(HEADINGS);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      expect(m.listenerCount("update")).toBe(1);
      expect(m.listenerCount("transaction")).toBe(1);
      handle.destroy();
      expect(m.listenerCount("update")).toBe(0);
      expect(m.listenerCount("transaction")).toBe(0);
    });

    it("destroy 後の editor emit で例外を投げない", () => {
      const m = makeEditor(HEADINGS);
      const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
      handle.destroy();
      expect(() => m.emit("update")).not.toThrow();
    });

    it("二重 destroy しても安全", () => {
      const handle = createOutlinePanel(baseOpts());
      handle.destroy();
      expect(() => handle.destroy()).not.toThrow();
    });
  });
});

describe("fold の editor 同期（headingFoldExtension 連携・旧 useOutline parity）", () => {
  // 旧 React useOutline は foldedIndices 変更のたびに editor.commands.setFoldedHeadings を
  // 呼び decoration（.heading-folded）を適用していた。vanilla 版の同期リグレッション。
  const MIXED_LEVELS: MockNode[] = [
    { typeName: "heading", level: 1, text: "Intro" },
    { typeName: "heading", level: 2, text: "Background" },
    { typeName: "heading", level: 2, text: "Method" },
  ];

  function clickFoldAll(el: HTMLElement, label: string): void {
    (el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
  }

  it("fold-all クリックで setFoldedHeadings(全 heading index) を発火する", () => {
    const m = makeEditor(MIXED_LEVELS);
    const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
    clickFoldAll(handle.el, "foldAll");
    expect(m.setFoldedHeadings).toHaveBeenCalledWith(new Set([0, 1, 2]));
    handle.destroy();
  });

  it("unfold は段階展開（最小レベルのみ解除）し setFoldedHeadings を発火する", () => {
    const m = makeEditor(MIXED_LEVELS);
    const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
    clickFoldAll(handle.el, "foldAll"); // {0,1,2}
    m.setFoldedHeadings.mockClear();
    clickFoldAll(handle.el, "unfoldAll"); // H1(idx0) のみ展開 → {1,2}
    expect(m.setFoldedHeadings).toHaveBeenCalledWith(new Set([1, 2]));
    m.setFoldedHeadings.mockClear();
    clickFoldAll(handle.el, "unfoldAll"); // H2 展開 → {}
    expect(m.setFoldedHeadings).toHaveBeenCalledWith(new Set());
    handle.destroy();
  });

  it("個別 heading の折り畳みトグルでも setFoldedHeadings を発火する", () => {
    const m = makeEditor(MIXED_LEVELS);
    const handle = createOutlinePanel(baseOpts({ editor: m.editor }));
    const itemFoldBtn = handle.el.querySelector(
      'button[aria-label^="collapseSection"]',
    ) as HTMLButtonElement;
    expect(itemFoldBtn).toBeTruthy();
    itemFoldBtn.click();
    expect(m.setFoldedHeadings).toHaveBeenCalledWith(new Set([0]));
    handle.destroy();
  });
});
