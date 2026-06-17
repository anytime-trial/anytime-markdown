/**
 * components-vanilla/EditorContextMenu.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する。React/JSX は使わず、contextmenu イベント →
 * createMenu（anchorPosition）でのメニュー生成・各項目の editor コマンド / textarea 操作 /
 * 活性条件 / destroy のクリーンアップを mock editor で検証する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 *  - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText が var(--am-...)
 *    を含むことを見る）。currentColor は jsdom が小文字化、opacity:var() は NaN 化するため検証しない。
 *  - border shorthand/longhand は jsdom が round-trip しないため検証しない。
 *  - @floating-ui/dom は computePosition / autoUpdate をモックする（createMenu が内部利用するため）。
 *  - editor コマンドは mock editor の chain proxy で呼び出し有無を検証する。
 *
 * 検証観点:
 *  1. 生成前は DOM にメニューが無い（contextmenu まで遅延）
 *  2. contextmenu で createMenu が document.body へ自前マウントする（role=menu / menuitem 群）
 *  3. 各項目の aria-label 相当ラベル・disabled 活性条件
 *  4. イベント発火（cut/copy/paste/clear/mode 切替 → editor コマンド / コールバック）
 *  5. ソースモード（textarea 操作・pasteAsMarkdown 等の非表示）
 *  6. onClose（背景クリック / 項目クリック）でメニューが閉じる
 *  7. VS Code paste イベント（vscode-paste-markdown / -codeblock）の購読
 *  8. destroy（メニュー閉・contextmenu / paste listener 解放）
 */

// @floating-ui/dom は createMenu → createFloating が利用するためモックする。
jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn().mockResolvedValue({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

import {
  createEditorContextMenu,
  type EditorContextMenuHandle,
} from "../components-vanilla/EditorContextMenu";
import { setMergeEditors } from "../contexts/MergeEditorsContext";

/** chain() の呼び出しを記録する fluent proxy。run() まで全メソッドを記録する。 */
function createChainRecorder(commands: string[], lastArgs: { value?: unknown }) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const methods = [
    "focus",
    "insertContent",
    "setImage",
    "clearContent",
    "run",
  ];
  for (const m of methods) {
    chain[m] = (...args: unknown[]) => {
      commands.push(m);
      if (m === "insertContent") lastArgs.value = args[0];
      return chain;
    };
  }
  return chain;
}

interface MockEditorOptions {
  isEditable?: boolean;
  selectionFrom?: number;
  selectionTo?: number;
}

function createMockEditor(opts: MockEditorOptions = {}) {
  const commands: string[] = [];
  const lastArgs: { value?: unknown } = {};
  const dispatched: unknown[] = [];
  const dom = document.createElement("div");
  dom.setAttribute("contenteditable", "true");

  const from = opts.selectionFrom ?? 1;
  const to = opts.selectionTo ?? 1;

  const initCommentsCalls: unknown[] = [];
  const editor = {
    isEditable: opts.isEditable ?? true,
    commands: {
      initComments: (m: unknown) => {
        initCommentsCalls.push(m);
        return true;
      },
    },
    state: {
      selection: {
        from,
        to,
        $from: { after: () => 2, depth: 1, node: () => ({ type: { name: "paragraph" } }), before: () => 0 },
      },
      doc: { content: { size: 10 }, resolve: () => ({ nodeBefore: null }), nodeAt: () => null },
      tr: { insert: () => ({ scrollIntoView: () => ({}) }), doc: { content: { size: 10 } } },
    },
    view: {
      dom,
      dispatch: (tr: unknown) => dispatched.push(tr),
    },
    chain: () => createChainRecorder(commands, lastArgs),
  };

  return { editor: editor as never, commands, lastArgs, dispatched, dom, initCommentsCalls };
}

const t = (key: string) => key;

/** document.body 内の開いているメニュー（role=menu）を取得する。 */
function queryMenu(): HTMLElement | null {
  return document.body.querySelector('[role="menu"]');
}
function queryMenuItems(): HTMLElement[] {
  const menu = queryMenu();
  return menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] : [];
}
function itemLabels(): string[] {
  return queryMenuItems().map((li) => li.textContent ?? "");
}
function clickItemByLabel(label: string): void {
  const item = queryMenuItems().find((li) => (li.textContent ?? "").includes(label));
  item?.click();
}

/** contextmenu を dom に対して発火する。 */
function fireContextMenu(dom: HTMLElement): void {
  dom.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 200, cancelable: true }));
}

describe("createEditorContextMenu", () => {
  const root = document.documentElement;
  let handle: EditorContextMenuHandle | undefined;

  beforeEach(() => {
    root.style.setProperty("--am-color-bg-paper", "rgb(255,255,255)");
    root.style.setProperty("--am-color-divider", "rgb(200,200,200)");
    root.style.setProperty("--am-color-text-primary", "rgb(0,0,0)");
    root.style.setProperty("--am-color-text-secondary", "rgb(100,100,100)");
    root.style.setProperty("--am-elevation-3", "0 3px 5px rgba(0,0,0,0.2)");
    document.body.appendChild(document.createElement("div")); // 既存 activeElement 用ダミー
  });

  afterEach(() => {
    handle?.destroy();
    handle = undefined;
    document.body.innerHTML = "";
  });

  it("生成直後はメニューを DOM へマウントしない（contextmenu まで遅延）", () => {
    const m = createMockEditor();
    handle = createEditorContextMenu({ editor: m.editor, t });
    expect(queryMenu()).toBeNull();
  });

  it("contextmenu でメニュー（role=menu）を document.body へ自前マウントする", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t });

    fireContextMenu(m.dom);

    const menu = queryMenu();
    expect(menu).toBeTruthy();
    // paperStyle が CSS 変数経由で当たっている（cssText に var が残る）。
    expect(menu!.style.cssText).toContain("var(--am-color-bg-paper)");
    expect(menu!.style.minWidth).toBe("180px");
    // 寸法 CSS 変数（MenuItem が参照）が paper に注入されている。
    expect(menu!.style.cssText).toContain("--am-menu-item-minh");
  });

  it("contextmenu の preventDefault を呼ぶ（ブラウザ既定メニュー抑止）", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t });

    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    m.dom.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("wysiwyg モードでは cut/copy/paste + pasteAsMarkdown/CodeBlock + clearScreen を表示する", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    const labels = itemLabels();
    expect(labels.some((l) => l.includes("cut"))).toBe(true);
    expect(labels.some((l) => l.includes("copy"))).toBe(true);
    expect(labels.some((l) => l.includes("paste"))).toBe(true);
    expect(labels.some((l) => l.includes("pasteAsMarkdown"))).toBe(true);
    expect(labels.some((l) => l.includes("pasteAsCodeBlock"))).toBe(true);
    expect(labels.some((l) => l.includes("clearScreen"))).toBe(true);
  });

  it("source モードでは pasteAsMarkdown / pasteAsCodeBlock を表示しない", () => {
    const m = createMockEditor();
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    handle = createEditorContextMenu({
      editor: m.editor,
      t,
      currentMode: "source",
      extraContainer: ta,
      sourceTextarea: ta,
    });

    fireContextMenu(ta);
    const labels = itemLabels();
    expect(labels.some((l) => l.includes("pasteAsMarkdown"))).toBe(false);
    expect(labels.some((l) => l.includes("pasteAsCodeBlock"))).toBe(false);
    expect(labels.some((l) => l.includes("clearScreen"))).toBe(true);
  });

  it("モード切替項目（review / wysiwyg / source）は表示しない（ツールバーへ集約）", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    const labels = itemLabels();
    expect(labels.some((l) => l.includes("review"))).toBe(false);
    expect(labels.some((l) => l.includes("wysiwyg"))).toBe(false);
    // source 行は出ないこと（pasteAsMarkdown 等の通常項目は別途存在）。
    expect(labels).not.toContain("source");
  });

  describe("比較モード左ペインの readOnly オーバーライド", () => {
    const ariaDisabled = (label: string): string | null =>
      queryMenuItems().find((li) => (li.textContent ?? "").includes(label))
        ?.getAttribute("aria-disabled") ?? null;

    afterEach(() => setMergeEditors(null));

    it("左ペイン右クリックでは編集モードでも paste/clearScreen が disabled（レビュー相当）", () => {
      const main = createMockEditor(); // 編集可能な本文（右ペイン）
      const left = createMockEditor(); // readOnly な比較（左ペイン）
      const wrap = document.createElement("div");
      wrap.append(main.dom, left.dom);
      document.body.appendChild(wrap);
      setMergeEditors({ rightEditor: main.editor, leftEditor: left.editor });
      handle = createEditorContextMenu({ editor: main.editor, t, currentMode: "wysiwyg", extraContainer: wrap });

      fireContextMenu(left.dom);
      expect(ariaDisabled("paste")).toBe("true");
      expect(ariaDisabled("clearScreen")).toBe("true");
    });

    it("右ペイン（本文）右クリックは従来どおり編集可能（paste 有効）", () => {
      const main = createMockEditor();
      const left = createMockEditor();
      const wrap = document.createElement("div");
      wrap.append(main.dom, left.dom);
      document.body.appendChild(wrap);
      setMergeEditors({ rightEditor: main.editor, leftEditor: left.editor });
      handle = createEditorContextMenu({ editor: main.editor, t, currentMode: "wysiwyg", extraContainer: wrap });

      fireContextMenu(main.dom);
      expect(ariaDisabled("paste")).not.toBe("true");
    });
  });

  it("readOnly では cut/paste/clearScreen が disabled（aria-disabled=true）になる", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, readOnly: true, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    const byLabel = (label: string) =>
      queryMenuItems().find((li) => (li.textContent ?? "").includes(label));

    expect(byLabel("cut")?.getAttribute("aria-disabled")).toBe("true");
    expect(byLabel("paste")?.getAttribute("aria-disabled")).toBe("true");
    expect(byLabel("clearScreen")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("選択もブロックも無いと copy が disabled になる", () => {
    const m = createMockEditor({ selectionFrom: 1, selectionTo: 1 });
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "review" });

    fireContextMenu(m.dom);
    const byLabel = (label: string) =>
      queryMenuItems().find((li) => (li.textContent ?? "").includes(label));
    expect(byLabel("copy")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("選択があると copy が有効になる", () => {
    const m = createMockEditor({ selectionFrom: 1, selectionTo: 5 });
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    const copy = queryMenuItems().find((li) => (li.textContent ?? "").includes("copy"));
    expect(copy?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("clearScreen クリックで editor.chain().clearContent().run() を呼びメニューを閉じる", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    clickItemByLabel("clearScreen");

    expect(m.commands).toContain("clearContent");
    expect(m.commands).toContain("run");
    // 画面クリア時はコメント plugin state も空 Map で初期化する。
    expect(m.initCommentsCalls.length).toBe(1);
    expect(m.initCommentsCalls[0]).toBeInstanceOf(Map);
    expect((m.initCommentsCalls[0] as Map<string, unknown>).size).toBe(0);
    expect(queryMenu()).toBeNull(); // 閉じている
  });

  it("source モードの clearScreen ではコメント初期化を呼ばない", () => {
    const m = createMockEditor();
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    handle = createEditorContextMenu({
      editor: m.editor,
      t,
      currentMode: "source",
      extraContainer: ta,
      sourceTextarea: ta,
    });
    fireContextMenu(ta);
    clickItemByLabel("clearScreen");
    expect(m.initCommentsCalls.length).toBe(0);
  });

  it("source モードの clearScreen は textarea を空にし input を発火する", () => {
    const m = createMockEditor();
    const ta = document.createElement("textarea");
    ta.value = "hello";
    document.body.appendChild(ta);
    let inputFired = 0;
    ta.addEventListener("input", () => (inputFired += 1));
    handle = createEditorContextMenu({
      editor: m.editor,
      t,
      currentMode: "source",
      extraContainer: ta,
      sourceTextarea: ta,
    });

    fireContextMenu(ta);
    clickItemByLabel("clearScreen");

    expect(ta.value).toBe("");
    expect(inputFired).toBeGreaterThanOrEqual(1);
  });

  it("source モードの copy は選択テキストをクリップボードに書く", () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const m = createMockEditor();
    const ta = document.createElement("textarea");
    ta.value = "hello world";
    document.body.appendChild(ta);
    ta.setSelectionRange(0, 5);
    handle = createEditorContextMenu({
      editor: m.editor,
      t,
      currentMode: "source",
      extraContainer: ta,
      sourceTextarea: ta,
    });

    fireContextMenu(ta);
    clickItemByLabel("copy");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("各メニュー項目に ListItemIcon(svg) と ListItemText を持つ", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    for (const li of queryMenuItems()) {
      expect(li.querySelector("svg")).toBeTruthy();
    }
  });

  it("cut/copy/paste にショートカットヒント(Ctrl+X 等)を表示する", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    const cut = queryMenuItems().find((li) => (li.textContent ?? "").includes("cut"));
    expect(cut?.textContent).toContain("Ctrl+X");
  });

  it("再度 contextmenu で既存メニューを閉じてから開き直す（多重表示しない）", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    fireContextMenu(m.dom);
    expect(document.body.querySelectorAll('[role="menu"]').length).toBe(1);
  });

  it("背景バックドロップのクリックでメニューが閉じる", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    const backdrop = document.body.querySelector("[data-am-menu-backdrop]") as HTMLElement;
    expect(backdrop).toBeTruthy();
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(queryMenu()).toBeNull();
  });

  it("vscode-paste-markdown イベントで insertContent を呼ぶ", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t });

    globalThis.dispatchEvent(new CustomEvent("vscode-paste-markdown", { detail: "# hello" }));
    expect(m.commands).toContain("insertContent");
  });

  it("vscode-paste-codeblock イベントで codeBlock を insertContent する", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t });

    globalThis.dispatchEvent(new CustomEvent("vscode-paste-codeblock", { detail: "const x = 1;" }));
    expect(m.commands).toContain("insertContent");
    expect((m.lastArgs.value as { type?: string } | undefined)?.type).toBe("codeBlock");
  });

  it("update(editor) で contextmenu を新しい editor の dom へ張り替える", () => {
    const m1 = createMockEditor();
    const m2 = createMockEditor();
    document.body.appendChild(m1.dom);
    document.body.appendChild(m2.dom);
    handle = createEditorContextMenu({ editor: m1.editor, t, currentMode: "wysiwyg" });

    handle.update({ editor: m2.editor });

    // 旧 dom では開かない。
    fireContextMenu(m1.dom);
    expect(queryMenu()).toBeNull();

    // 新 dom で開く。
    fireContextMenu(m2.dom);
    expect(queryMenu()).toBeTruthy();
  });

  it("destroy で開いているメニューを閉じ、contextmenu / paste listener を解放する", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t, currentMode: "wysiwyg" });

    fireContextMenu(m.dom);
    expect(queryMenu()).toBeTruthy();

    handle.destroy();
    expect(queryMenu()).toBeNull();

    // destroy 後の contextmenu / paste イベントは何も起こさない。
    fireContextMenu(m.dom);
    expect(queryMenu()).toBeNull();

    m.commands.length = 0;
    globalThis.dispatchEvent(new CustomEvent("vscode-paste-markdown", { detail: "x" }));
    expect(m.commands.length).toBe(0);

    handle = undefined;
  });

  it("destroy は冪等（2 回呼んでもエラーにならない）", () => {
    const m = createMockEditor();
    document.body.appendChild(m.dom);
    handle = createEditorContextMenu({ editor: m.editor, t });
    handle.destroy();
    expect(() => handle!.destroy()).not.toThrow();
    handle = undefined;
  });
});
