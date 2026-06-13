/**
 * framework-decoupling Phase 3（ホスト隔離）chrome エンジンのテスト。
 *
 * (1) `new Editor()`（core Editor）が React なしで生成・操作できること、
 * (2) chrome seam（選択追従 tracker / 配置 anchor / chrome shell）が
 *     `editor.on('transaction')` 購読のみで React なしに機能すること、
 * (3) pos 選択中は scroll / resize を購読し、解除時にリスナを外すこと
 * を real editor で実証する。
 */
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";

import {
  createBlockChromeAnchor,
  createSelectedBlockTracker,
  type SelectedBlockSnapshot,
  selectedBlockPos,
} from "../chrome/blockChrome";
import { createToolbarContainer } from "../chrome/vanillaToolbar";

function makeEditor(): Editor {
  return new Editor({
    extensions: [StarterKit],
    content: "<p>hi</p><pre><code>abc</code></pre>",
  });
}

function findCodeBlockPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === "codeBlock") found = pos;
  });
  return found;
}

describe("vanilla editor 生成（React 非依存）", () => {
  it("new Editor() で生成・操作できコードブロックを含む", () => {
    const editor = makeEditor();
    expect(editor).toBeInstanceOf(Editor);
    expect(findCodeBlockPos(editor)).toBeGreaterThanOrEqual(0);
    editor.destroy();
  });
});

describe("selectedBlockPos", () => {
  it("選択が codeBlock 内なら pos、外なら -1", () => {
    const editor = makeEditor();
    const cbPos = findCodeBlockPos(editor);
    editor.commands.setTextSelection(cbPos + 1);
    expect(selectedBlockPos(editor, "codeBlock")).toBe(cbPos);
    editor.commands.setTextSelection(1); // paragraph 内
    expect(selectedBlockPos(editor, "codeBlock")).toBe(-1);
    editor.destroy();
  });
});

describe("createSelectedBlockTracker", () => {
  it("選択変化で snapshot を通知し、解除後は通知しない", () => {
    const editor = makeEditor();
    const cbPos = findCodeBlockPos(editor);
    const snaps: SelectedBlockSnapshot[] = [];
    const stop = createSelectedBlockTracker(editor, "codeBlock", (s) => snaps.push(s));

    editor.commands.setTextSelection(cbPos + 1); // codeBlock へ
    editor.commands.setTextSelection(1); // 外へ
    const countBeforeStop = snaps.length;
    expect(snaps.some((s) => s.pos === cbPos)).toBe(true);
    expect(snaps.at(-1)?.pos).toBe(-1);

    stop();
    editor.commands.setTextSelection(cbPos + 1);
    expect(snaps.length).toBe(countBeforeStop); // 解除後は増えない
    editor.destroy();
  });

  it("pos 選択中のみ scroll / resize を購読し、解除でリスナを外す", () => {
    const editor = makeEditor();
    const cbPos = findCodeBlockPos(editor);
    const added = new Set<string>();
    const removed = new Set<string>();
    const addSpy = jest
      .spyOn(globalThis, "addEventListener")
      .mockImplementation(((type: string) => { added.add(type); }) as typeof globalThis.addEventListener);
    const removeSpy = jest
      .spyOn(globalThis, "removeEventListener")
      .mockImplementation(((type: string) => { removed.add(type); }) as typeof globalThis.removeEventListener);

    const stop = createSelectedBlockTracker(editor, "codeBlock", () => {});

    // 初期は未選択 → scroll/resize 未購読
    expect(added.has("scroll")).toBe(false);

    editor.commands.setTextSelection(cbPos + 1); // codeBlock 選択 → 購読開始
    expect(added.has("scroll")).toBe(true);
    expect(added.has("resize")).toBe(true);

    editor.commands.setTextSelection(1); // 選択外 → 解除
    expect(removed.has("scroll")).toBe(true);
    expect(removed.has("resize")).toBe(true);

    stop();
    addSpy.mockRestore();
    removeSpy.mockRestore();
    editor.destroy();
  });
});

describe("createBlockChromeAnchor", () => {
  it("rect 追従・null で非表示・destroy で除去", () => {
    const anchor = createBlockChromeAnchor();
    expect(document.body.contains(anchor.el)).toBe(true);
    anchor.setRect({ top: 10, left: 20 } as DOMRect);
    expect(anchor.el.style.display).toBe("");
    // ツールバーはブロック上側へ配置する（top は上ギャップぶん持ち上げる）。
    expect(anchor.el.style.top).toBe("4px"); // 10 - ABOVE_GAP_PX(6)
    expect(anchor.el.style.left).toBe("20px");
    anchor.setRect(null);
    expect(anchor.el.style.display).toBe("none");
    anchor.destroy();
    expect(document.body.contains(anchor.el)).toBe(false);
  });

  // 回帰: 反転アーキテクチャ以降、ツールバーを rect.top にそのまま置くとテーブルの
  // ヘッダ行などブロック本体に重なる。ツールバー自身の高さぶん持ち上げて上側に逃がす。
  it("ツールバーをブロック上側へ逃がす（translateY(-100%) でブロック本体と重ならない）", () => {
    const anchor = createBlockChromeAnchor();
    expect(anchor.el.style.transform).toBe("translateY(-100%)");
    anchor.setRect({ top: 100, left: 50 } as DOMRect);
    // translateY(-100%) でツールバー高さぶん上に出る + top は上ギャップで rect.top より上。
    expect(anchor.el.style.transform).toBe("translateY(-100%)");
    expect(Number.parseInt(anchor.el.style.top, 10)).toBeLessThan(100);
    anchor.destroy();
  });
});

describe("createToolbarContainer", () => {
  // 回帰: ツールバーは上側フロート配置で直前ブロックに重なり得る。半透明だと背後の
  // テキストが透けて二重に見えるため、不透明背景（bg-paper）+ 枠線 + 影で手前に見せる。
  it("不透明背景（bg-paper）+ 枠線 + 影を持つ", () => {
    const el = createToolbarContainer("table");
    const css = el.style.cssText;
    expect(css).toContain("var(--am-color-bg-paper)");
    expect(css).not.toContain("var(--am-color-action-hover)");
    expect(css).toContain("border");
    expect(css).toContain("box-shadow");
  });
});
