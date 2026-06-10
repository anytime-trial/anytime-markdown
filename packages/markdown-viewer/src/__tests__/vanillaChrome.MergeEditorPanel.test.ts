/**
 * components-vanilla/MergeEditorPanel.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する。React/JSX は使わない。
 * パネル系のため self-append しない（呼び元が el を配置）。テストでは document.body へ配置して検証する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 *  - getComputedStyle で継承 CSS カスタムプロパティを検証しない（style.cssText の var(--am-...) を見る）。
 *  - currentColor / border shorthand / opacity:var() は jsdom で round-trip しないため検証しない。
 *  - ResizeObserver / scrollIntoView は jsdom 未実装のため、本ファクトリは存在ガードしている。
 *    テスト側でも ResizeObserver を最小モックする。
 */

import {
  createMergeEditorPanel,
  type CreateMergeEditorPanelOptions,
  type MergeEditorPanelHandle,
} from "../components-vanilla/MergeEditorPanel";
import type { DiffLine } from "@anytime-markdown/markdown-engine";

const t = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

const editorSettings = { fontSize: 14, lineHeight: 1.6 };

// ResizeObserver を最小モック（jsdom 未実装）。observe/disconnect が呼べることのみ保証する。
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mkOpts(over: Partial<CreateMergeEditorPanelOptions> = {}): CreateMergeEditorPanelOptions {
  return { t, editorSettings, sourceMode: true, ...over };
}

function textareas(root: HTMLElement): HTMLTextAreaElement[] {
  return Array.from(root.querySelectorAll("textarea"));
}

describe("createMergeEditorPanel", () => {
  let handle: MergeEditorPanelHandle | null = null;
  let originalRO: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    handle?.destroy();
    handle = null;
    if (originalRO) {
      globalThis.ResizeObserver = originalRO;
    } else {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    }
    document.body.replaceChildren();
    // 注入した共有 <style> は累積しても害がないため残す（ensureStyle は冪等）。
  });

  it("pseudo-class 用の共有 <style> を document.head へ 1 度だけ注入する", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "a\nb" }));
    const styles = document.head.querySelectorAll("#am-vanilla-merge-editor-panel");
    expect(styles.length).toBe(1);
    // 2 度目の生成でも重複注入しない。
    const h2 = createMergeEditorPanel(mkOpts({ sourceText: "x" }));
    expect(document.head.querySelectorAll("#am-vanilla-merge-editor-panel").length).toBe(1);
    h2.destroy();
  });

  it("ソースモード: Paper ルートを返し textarea に sourceText を流し込む", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "line1\nline2\nline3" }));
    document.body.appendChild(handle.el);
    // outlined Paper（--am-color-* CSS 変数で着色）。
    expect(handle.el.style.cssText).toContain("var(--am-color-bg-paper)");
    expect(handle.el.style.cssText).toContain("var(--am-color-divider)");
    const tas = textareas(handle.el);
    expect(tas.length).toBe(1);
    expect(tas[0].value).toBe("line1\nline2\nline3");
  });

  it("ソースモード: 行番号ガターに行数ぶんの行が並ぶ", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "a\nb\nc\nd" }));
    document.body.appendChild(handle.el);
    // ガターは textarea の前にある最初の固定幅 div。行番号 1..4 が含まれる。
    const text = handle.el.textContent ?? "";
    expect(text).toContain("1");
    expect(text).toContain("4");
  });

  it("ソースモード: 入力で onSourceChange が発火する", () => {
    const changes: string[] = [];
    handle = createMergeEditorPanel(mkOpts({ sourceText: "hello", onSourceChange: (v) => changes.push(v) }));
    const ta = textareas(handle.el)[0];
    ta.value = "hello world";
    ta.dispatchEvent(new Event("input"));
    expect(changes).toEqual(["hello world"]);
  });

  it("ソースモード: diffLines の padding 行は input から除外されて onSourceChange に渡る", () => {
    const diffLines: DiffLine[] = [
      { text: "a", type: "equal", blockId: null, lineNumber: 1 },
      { text: "", type: "padding", blockId: null, lineNumber: null },
      { text: "b", type: "added", blockId: 0, lineNumber: 2 },
    ];
    const changes: string[] = [];
    handle = createMergeEditorPanel(mkOpts({
      sourceText: "a\nb",
      diffLines,
      onSourceChange: (v) => changes.push(v),
    }));
    const ta = textareas(handle.el)[0];
    // 表示テキストは "a\n\nb"（padding 行が空行）。padding 行を空のまま入力。
    ta.value = "a\n\nb";
    ta.dispatchEvent(new Event("input"));
    // padding 行（index 1, 空）が除外されて "a\nb" になる。
    expect(changes).toEqual(["a\nb"]);
  });

  it("ソースモード: 左ペインで diff ブロックの先頭行にマージボタン（IconButton）が出る", () => {
    const diffLines: DiffLine[] = [
      { text: "a", type: "equal", blockId: null, lineNumber: 1 },
      { text: "b", type: "added", blockId: 3, lineNumber: 2 },
      { text: "c", type: "added", blockId: 3, lineNumber: 3 },
    ];
    const merges: Array<[number, string]> = [];
    handle = createMergeEditorPanel(mkOpts({
      sourceText: "a\nb\nc",
      diffLines,
      side: "left",
      onMerge: (blockId, dir) => merges.push([blockId, dir]),
    }));
    document.body.appendChild(handle.el);
    // マージガターのアイコンボタン（aria-label = mergeLeftToRight）。
    const btn = handle.el.querySelector<HTMLButtonElement>('button[aria-label="mergeLeftToRight"]');
    expect(btn).not.toBeNull();
    btn?.click();
    expect(merges).toEqual([[3, "left-to-right"]]);
  });

  it("ソースモード: 右ペインのマージボタンは right-to-left 方向で発火する", () => {
    const diffLines: DiffLine[] = [
      { text: "x", type: "removed", blockId: 1, lineNumber: 1 },
    ];
    const merges: Array<[number, string]> = [];
    handle = createMergeEditorPanel(mkOpts({
      sourceText: "x",
      diffLines,
      side: "right",
      onMerge: (blockId, dir) => merges.push([blockId, dir]),
    }));
    document.body.appendChild(handle.el);
    const btn = handle.el.querySelector<HTMLButtonElement>('button[aria-label="mergeRightToLeft"]');
    expect(btn).not.toBeNull();
    btn?.click();
    expect(merges).toEqual([[1, "right-to-left"]]);
  });

  it("ソースモード: ミラー行の背景色が CSS 変数 + color-mix で着色される（added=success / removed=error）", () => {
    const diffLines: DiffLine[] = [
      { text: "g", type: "added", blockId: 0, lineNumber: 1 },
      { text: "r", type: "removed", blockId: 1, lineNumber: 2 },
      { text: "e", type: "equal", blockId: null, lineNumber: 3 },
    ];
    handle = createMergeEditorPanel(mkOpts({ sourceText: "g\nr\ne", diffLines }));
    document.body.appendChild(handle.el);
    const mirror = handle.el.querySelector('[aria-hidden="true"]') as HTMLElement;
    const rows = Array.from(mirror.children) as HTMLElement[];
    expect(rows[0].style.backgroundColor).toContain("var(--am-color-success-main)");
    expect(rows[1].style.backgroundColor).toContain("var(--am-color-error-main)");
    expect(rows[2].style.backgroundColor).toBe("transparent");
  });

  it("ソースモード: select で onHoverLine が現在行 index を通知する", () => {
    const diffLines: DiffLine[] = [
      { text: "aa", type: "equal", blockId: null, lineNumber: 1 },
      { text: "bb", type: "equal", blockId: null, lineNumber: 2 },
    ];
    const hovers: Array<number | null> = [];
    handle = createMergeEditorPanel(mkOpts({
      sourceText: "aa\nbb",
      diffLines,
      onHoverLine: (i) => hovers.push(i),
    }));
    const ta = textareas(handle.el)[0];
    // 2 行目（index 1）にカーソルを置く（"aa\n" の後 = position 3）。
    ta.selectionStart = 4;
    ta.selectionEnd = 4;
    ta.dispatchEvent(new Event("select"));
    expect(hovers).toEqual([1]);
  });

  it("ソースモード: collapse で未変更ランが ExpanderRow に畳まれ、クリックで onToggleExpand", () => {
    // 先頭に未変更 6 行、末尾に変更 1 行。contextLines=1 で先頭側が畳まれる。
    const diffLines: DiffLine[] = [];
    for (let i = 0; i < 6; i++) {
      diffLines.push({ text: `eq${i}`, type: "equal", blockId: null, lineNumber: i + 1 });
    }
    diffLines.push({ text: "chg", type: "added", blockId: 0, lineNumber: 7 });
    const toggles: number[] = [];
    handle = createMergeEditorPanel(mkOpts({
      sourceText: diffLines.map((d) => d.text).join("\n"),
      diffLines,
      collapse: true,
      contextLines: 1,
      onToggleExpand: (s) => toggles.push(s),
    }));
    document.body.appendChild(handle.el);
    const expander = handle.el.querySelector('[role="button"]') as HTMLElement;
    expect(expander).not.toBeNull();
    expect(expander.getAttribute("aria-label")).toContain("expandLines");
    expander.click();
    expect(toggles.length).toBe(1);
  });

  it("ExpanderRow: Enter/Space キーで onToggleExpand が発火する", () => {
    const diffLines: DiffLine[] = [];
    for (let i = 0; i < 6; i++) {
      diffLines.push({ text: `eq${i}`, type: "equal", blockId: null, lineNumber: i + 1 });
    }
    diffLines.push({ text: "chg", type: "added", blockId: 0, lineNumber: 7 });
    const toggles: number[] = [];
    handle = createMergeEditorPanel(mkOpts({
      sourceText: diffLines.map((d) => d.text).join("\n"),
      diffLines,
      collapse: true,
      contextLines: 1,
      onToggleExpand: (s) => toggles.push(s),
    }));
    document.body.appendChild(handle.el);
    const expander = handle.el.querySelector('[role="button"]') as HTMLElement;
    expander.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expander.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(toggles.length).toBe(2);
  });

  it("ソースモード: hideScrollbar で textarea に scrollbar 隠蔽クラスが付く", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "a", hideScrollbar: true }));
    const ta = textareas(handle.el)[0];
    expect(ta.className).toContain("am-merge-textarea-hide-scrollbar");
  });

  it("ソースモード: readOnly で textarea が readonly になる", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "a", readOnly: true }));
    const ta = textareas(handle.el)[0];
    expect(ta.readOnly).toBe(true);
  });

  it("WYSIWYG モード: editor のマウント要素を root へ移設し scope クラスを付与する", () => {
    const mount = document.createElement("div");
    mount.className = "tiptap";
    const fakeEditor = { options: { element: mount } } as unknown as import("@anytime-markdown/markdown-react").Editor;
    handle = createMergeEditorPanel(mkOpts({
      sourceMode: false,
      side: "left",
      editor: fakeEditor,
      tiptapCss: ".am-merge-content-left .tiptap{color:var(--am-color-text-primary);}",
    }));
    document.body.appendChild(handle.el);
    expect(handle.el.classList.contains("am-merge-content-left")).toBe(true);
    expect(mount.parentElement).toBe(handle.el);
    // tiptap CSS がスコープ付き <style> として注入される。
    expect(document.head.querySelector("#am-vanilla-merge-editor-panel-tiptap-am-merge-content-left")).not.toBeNull();
  });

  it("update: sourceText 差し替えで textarea が再構築される", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "old" }));
    expect(textareas(handle.el)[0].value).toBe("old");
    handle.update({ sourceText: "new value" });
    expect(textareas(handle.el)[0].value).toBe("new value");
  });

  it("destroy: textarea listener を解除し（input が発火しなくなる）root を空にする", () => {
    const changes: string[] = [];
    handle = createMergeEditorPanel(mkOpts({ sourceText: "a", onSourceChange: (v) => changes.push(v) }));
    const ta = textareas(handle.el)[0];
    handle.destroy();
    // destroy 後は root が空。
    expect(handle.el.children.length).toBe(0);
    // 解除済みなので input しても発火しない。
    ta.value = "z";
    ta.dispatchEvent(new Event("input"));
    expect(changes).toEqual([]);
  });

  it("destroy 後の update は no-op（再描画しない）", () => {
    handle = createMergeEditorPanel(mkOpts({ sourceText: "a" }));
    handle.destroy();
    handle.update({ sourceText: "b" });
    expect(handle.el.children.length).toBe(0);
  });
});
