/**
 * components-vanilla/EditorMenuPopovers.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する。React/JSX は使わない。editor は mock。
 * 各 Popover（help / diagram / sample / template / heading）の生成・属性・イベント発火・
 * destroy のクリーンアップを検証する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 *  - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText が
 *    var(--am-...) を含むことを見る）。
 *  - currentColor / border shorthand / opacity:var() は jsdom で round-trip しないため検証しない。
 *  - @floating-ui/dom はモックする（computePosition / autoUpdate は配置だけ no-op）。
 *  - editor コマンドは mock editor の chain proxy で呼び出し有無を検証する。
 */

// @floating-ui/dom をモック（配置計算は不要・popover の生成/属性/イベントのみ検証）。
jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() => Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} })),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

// constants/templates は raw .md を import するため jest が解析できない。ビルトイン 3 件を返す
// 形で mock する（id だけ実体に揃える。content の言語差は本テストの検証対象外）。
jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: (locale: string) => [
    { id: "markdown-all", name: "Markdown All", content: `all-${locale}`, builtin: true },
    { id: "api-spec", name: "API Spec", content: `api-${locale}`, builtin: true },
    { id: "basic-design", name: "Basic Design", content: `design-${locale}`, builtin: true },
  ],
}));

import {
  createEditorMenuPopovers,
  type EditorMenuPopoversHandle,
} from "../components-vanilla/EditorMenuPopovers";

/** t は key をそのまま返す。 */
const t = (key: string) => key;

/** chain() の呼び出しを記録する fluent proxy。run() で commands を返す。 */
function createChainRecorder(commands: string[]) {
  const chain: Record<string, (...a: any[]) => unknown> = {};
  const methods = [
    "focus",
    "setTextSelection",
    "setCodeBlock",
    "setParagraph",
    "setHeading",
    "toggleBulletList",
    "toggleOrderedList",
    "toggleTaskList",
    "toggleBlockquote",
    "lift",
    "command",
    "run",
  ];
  for (const m of methods) {
    chain[m] = (...args: any[]) => {
      commands.push(m);
      // command(({tr}) => ...) は内部 tr.replaceWith を呼ぶため tr スタブを渡す。
      if (m === "command" && typeof args[0] === "function") {
        args[0]({ tr: { replaceWith: () => {} } });
      }
      return chain;
    };
  }
  return chain;
}

interface MockEditorOptions {
  active?: Record<string, boolean>;
  selectionDepth?: number;
  nodeAt?: Record<number, { typeName: string; language?: string }>;
}

function createMockEditor(opts: MockEditorOptions = {}) {
  const active: Record<string, boolean> = { ...(opts.active ?? {}) };
  const commands: string[] = [];
  const insertContentCalls: any[] = [];
  const depth = opts.selectionDepth ?? 0;

  const editor: any = {
    isActive: (name: string) => Boolean(active[name]),
    chain: () => createChainRecorder(commands),
    commands: {
      insertContent: (c: any) => {
        insertContentCalls.push(c);
      },
    },
    state: {
      selection: {
        $from: {
          depth,
          node: (d: number) => {
            const n = opts.nodeAt?.[d];
            return {
              type: { name: n?.typeName ?? "paragraph" },
              attrs: { language: n?.language },
            };
          },
          start: (_d: number) => 1,
          end: (_d: number) => 5,
        },
      },
    },
    schema: { text: (s: string) => ({ text: s }) },
  };
  return { editor, commands, insertContentCalls, setActive: (n: string, v: boolean) => { active[n] = v; } };
}

/** popover の paper（role=menu）を document から取得する。 */
function getPaper(ariaLabel: string): HTMLElement | null {
  return document.querySelector(`[data-am-popover-paper][aria-label="${ariaLabel}"]`);
}

describe("createEditorMenuPopovers", () => {
  let handle: EditorMenuPopoversHandle | undefined;
  let anchor: HTMLElement;

  beforeEach(() => {
    anchor = document.createElement("button");
    document.body.appendChild(anchor);
  });

  afterEach(() => {
    handle?.destroy();
    handle = undefined;
    anchor.remove();
    // 取り残し popover を掃除。
    document.querySelectorAll("[data-am-popover-root]").forEach((n) => n.remove());
  });

  it("生成直後はどの popover も開いていない", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    expect(document.querySelector("[data-am-popover-paper]")).toBeNull();
  });

  // --- help popover ---
  it("openHelp で help popover が開き、outline/comments/settings/version の 4 項目を生成する", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      onToggleOutline: () => {},
      onToggleComments: () => {},
      onOpenSettings: () => {},
    });
    handle.openHelp(anchor);
    const paper = getPaper("helpMenu");
    expect(paper).toBeTruthy();
    expect(paper!.getAttribute("role")).toBe("menu");
    const items = paper!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(4); // outline / comments / settings / version
    // divider が settings と version の間に 1 つ。
    expect(paper!.querySelectorAll('[role="separator"]').length).toBe(1);
  });

  it("hideVersionInfo=true かつ全コールバック無しなら help は項目も divider も持たない", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja", hideVersionInfo: true });
    handle.openHelp(anchor);
    const paper = getPaper("helpMenu")!;
    expect(paper.querySelectorAll('[role="menuitem"]').length).toBe(0);
    expect(paper.querySelectorAll('[role="separator"]').length).toBe(0);
  });

  it("help の outline 項目クリックで onToggleOutline が呼ばれ popover が閉じる", () => {
    const m = createMockEditor();
    let toggled = 0;
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      onToggleOutline: () => { toggled += 1; },
    });
    handle.openHelp(anchor);
    const item = getPaper("helpMenu")!.querySelector('[role="menuitem"]') as HTMLElement;
    item.click();
    expect(toggled).toBe(1);
    expect(getPaper("helpMenu")).toBeNull();
  });

  it("help の version 項目クリックで onOpenVersionDialog が呼ばれる", () => {
    const m = createMockEditor();
    let opened = 0;
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      onOpenVersionDialog: () => { opened += 1; },
    });
    handle.openHelp(anchor);
    const items = getPaper("helpMenu")!.querySelectorAll('[role="menuitem"]');
    (items[items.length - 1] as HTMLElement).click();
    expect(opened).toBe(1);
  });

  it("outlineOpen=true のとき outline アイコンが primary 色になる", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      onToggleOutline: () => {},
      outlineOpen: true,
    });
    handle.openHelp(anchor);
    const svg = getPaper("helpMenu")!.querySelector('[role="menuitem"] svg') as SVGElement;
    expect(svg.style.color).toContain("var(--am-color-primary-main)");
  });

  // --- diagram popover ---
  it("openDiagram で mermaid/plantuml の 2 つの menuitem ボタンを生成する", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openDiagram(anchor);
    const paper = getPaper("diagramMenu")!;
    const btns = paper.querySelectorAll('button[role="menuitem"]');
    expect(btns.length).toBe(2);
    expect((btns[0] as HTMLElement).getAttribute("aria-label")).toBe("mermaid");
    expect((btns[1] as HTMLElement).getAttribute("aria-label")).toBe("plantuml");
    // 各ボタンに inline svg がある。
    for (const b of btns) expect(b.querySelector("svg")).toBeTruthy();
  });

  it("diagram の mermaid クリックで setCodeBlock + insertContent が editor へ呼ばれ閉じる", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openDiagram(anchor);
    const btn = getPaper("diagramMenu")!.querySelector('button[aria-label="mermaid"]') as HTMLElement;
    btn.click();
    expect(m.commands).toContain("setCodeBlock");
    expect(m.insertContentCalls.length).toBe(1);
    expect(getPaper("diagramMenu")).toBeNull();
  });

  it("sourceMode の diagram は editor ではなく onSourceInsert* を呼ぶ", () => {
    const m = createMockEditor();
    let mermaid = 0;
    let plant = 0;
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      sourceMode: true,
      onSourceInsertMermaid: () => { mermaid += 1; },
      onSourceInsertPlantUml: () => { plant += 1; },
    });
    handle.openDiagram(anchor);
    (getPaper("diagramMenu")!.querySelector('button[aria-label="mermaid"]') as HTMLElement).click();
    expect(mermaid).toBe(1);
    expect(m.commands).not.toContain("setCodeBlock");

    handle.openDiagram(anchor);
    (getPaper("diagramMenu")!.querySelector('button[aria-label="plantuml"]') as HTMLElement).click();
    expect(plant).toBe(1);
  });

  // --- sample popover ---
  it("openSample は enabled なサンプルぶんの menuitem ボタンを生成する", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openSample(anchor);
    const btns = getPaper("plantumlSampleMenu")!.querySelectorAll('button[role="menuitem"]');
    expect(btns.length).toBeGreaterThan(0);
  });

  it("sample クリックは plantuml codeBlock 内なら command で置換し閉じる", () => {
    // depth=1 が plantuml codeBlock の選択を再現。
    const m = createMockEditor({
      selectionDepth: 1,
      nodeAt: { 1: { typeName: "codeBlock", language: "plantuml" } },
    });
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openSample(anchor);
    const btn = getPaper("plantumlSampleMenu")!.querySelector('button[role="menuitem"]') as HTMLElement;
    btn.click();
    expect(m.commands).toContain("command");
    expect(getPaper("plantumlSampleMenu")).toBeNull();
  });

  it("sample クリックが plantuml codeBlock 外なら command を呼ばない（が閉じる）", () => {
    const m = createMockEditor({ selectionDepth: 0 });
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openSample(anchor);
    (getPaper("plantumlSampleMenu")!.querySelector('button[role="menuitem"]') as HTMLElement).click();
    expect(m.commands).not.toContain("command");
    expect(getPaper("plantumlSampleMenu")).toBeNull();
  });

  // --- template popover ---
  it("openTemplate は locale に応じたビルトインテンプレート 3 件を生成する", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openTemplate(anchor);
    const items = getPaper("templateMenu")!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(3);
  });

  it("template クリックで onInsertTemplate が該当 tmpl で呼ばれ閉じる", () => {
    const m = createMockEditor();
    const inserted: string[] = [];
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      onInsertTemplate: (tmpl) => inserted.push(tmpl.id),
    });
    handle.openTemplate(anchor);
    (getPaper("templateMenu")!.querySelector('[role="menuitem"]') as HTMLElement).click();
    expect(inserted).toEqual(["markdown-all"]);
    expect(getPaper("templateMenu")).toBeNull();
  });

  // --- heading popover ---
  it("openHeading は Paragraph/H1-5 + bullet/ordered/task + blockquote と divider 2 本を生成する", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHeading({ anchorEl: anchor, pos: 3, currentLevel: 2 });
    const paper = getPaper("headingMenu")!;
    // 6 (levels) + 3 (list) + 1 (blockquote) = 10 menuitem。
    expect(paper.querySelectorAll('[role="menuitem"]').length).toBe(10);
    expect(paper.querySelectorAll('[role="separator"]').length).toBe(2);
  });

  it("heading の現在レベル項目が selected になる", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHeading({ anchorEl: anchor, pos: 3, currentLevel: 2 });
    const items = getPaper("headingMenu")!.querySelectorAll('[role="menuitem"]');
    // index 2 = H2（currentLevel=2）。selected は背景色 cssText で表現される。
    expect((items[2] as HTMLElement).style.cssText).toContain("var(--am-color-action-selected)");
  });

  it("heading の H1 クリックで setHeading が呼ばれ閉じる", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHeading({ anchorEl: anchor, pos: 3, currentLevel: 0 });
    const items = getPaper("headingMenu")!.querySelectorAll('[role="menuitem"]');
    (items[1] as HTMLElement).click(); // H1
    expect(m.commands).toContain("setHeading");
    expect(getPaper("headingMenu")).toBeNull();
  });

  it("heading の Paragraph クリックは（blockquote 外なら）setParagraph を呼ぶ", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHeading({ anchorEl: anchor, pos: 3, currentLevel: 1 });
    const items = getPaper("headingMenu")!.querySelectorAll('[role="menuitem"]');
    (items[0] as HTMLElement).click(); // Paragraph
    expect(m.commands).toContain("setParagraph");
  });

  it("heading の bulletList クリックで toggleBulletList を呼ぶ", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHeading({ anchorEl: anchor, pos: 3, currentLevel: 0 });
    const items = getPaper("headingMenu")!.querySelectorAll('[role="menuitem"]');
    (items[6] as HTMLElement).click(); // bulletList
    expect(m.commands).toContain("toggleBulletList");
  });

  it("heading の blockquote クリックで toggleBlockquote を呼ぶ", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHeading({ anchorEl: anchor, pos: 3, currentLevel: 0 });
    const items = getPaper("headingMenu")!.querySelectorAll('[role="menuitem"]');
    (items[9] as HTMLElement).click(); // blockquote
    expect(m.commands).toContain("toggleBlockquote");
  });

  // --- 排他・onClose・closeAll・destroy ---
  it("同じ popover を再度 openXxx すると古いものを閉じ 1 つだけ開く", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openTemplate(anchor);
    handle.openTemplate(anchor);
    expect(document.querySelectorAll('[data-am-popover-paper][aria-label="templateMenu"]').length).toBe(1);
  });

  it("背景クリック（onClose）で popover が閉じる", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openTemplate(anchor);
    const backdrop = document.querySelector("[data-am-popover-backdrop]") as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(getPaper("templateMenu")).toBeNull();
  });

  it("closeAll で開いている全 popover を閉じる", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openTemplate(anchor);
    handle.openDiagram(anchor);
    handle.closeAll();
    expect(document.querySelector("[data-am-popover-paper]")).toBeNull();
  });

  it("destroy で全 popover が閉じ、DOM から消える", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHelp(anchor);
    handle.destroy();
    handle = undefined;
    expect(document.querySelector("[data-am-popover-root]")).toBeNull();
  });

  it("destroy は冪等（2 回呼んでもエラーにならない）", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.openHelp(anchor);
    handle.destroy();
    expect(() => handle!.destroy()).not.toThrow();
    handle = undefined;
  });

  it("update で locale を切り替えると template の言語が反映される", () => {
    const m = createMockEditor();
    handle = createEditorMenuPopovers({ editor: m.editor, t, locale: "ja" });
    handle.update({ locale: "en" });
    handle.openTemplate(anchor);
    // en でもビルトインは 3 件（content だけ言語差）。生成数で update 反映を間接確認。
    expect(getPaper("templateMenu")!.querySelectorAll('[role="menuitem"]').length).toBe(3);
  });

  it("update で sourceMode を有効化すると diagram が source コールバックを使う", () => {
    const m = createMockEditor();
    let mermaid = 0;
    handle = createEditorMenuPopovers({
      editor: m.editor,
      t,
      locale: "ja",
      onSourceInsertMermaid: () => { mermaid += 1; },
    });
    handle.update({ sourceMode: true });
    handle.openDiagram(anchor);
    (getPaper("diagramMenu")!.querySelector('button[aria-label="mermaid"]') as HTMLElement).click();
    expect(mermaid).toBe(1);
    expect(m.commands).not.toContain("setCodeBlock");
  });
});
