/**
 * sourceModeController の「比較モード分離」リグレッションテスト。
 *
 * 比較モード中（isExternallyManaged() === true）は、source モードの standalone DOM
 * （textarea / 行番号ガター / editor.view.dom の display 操作 / contentEl への append）を
 * 行わない。表示は比較ビュー（InlineMergeView）が担い、sourceController は mode/text の
 * ストアに徹する。比較 enter/exit の受け渡しは detachStandaloneUi / attachStandaloneUi で行う。
 */

import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";

import { createSourceModeController } from "../host/sourceModeController";

const t = (key: string): string => key;

interface Ctx {
  contentEl: HTMLElement;
  editor: Editor;
}

function setup(): Ctx {
  const contentEl = document.createElement("div");
  document.body.appendChild(contentEl);
  const editor = new Editor({ extensions: [StarterKit], content: "# Hello" });
  contentEl.appendChild(editor.view.dom);
  return { contentEl, editor };
}

function makeController(ctx: Ctx, isExternallyManaged?: () => boolean) {
  return createSourceModeController({
    editor: ctx.editor,
    contentEl: ctx.contentEl,
    t,
    getFrontmatter: () => null,
    setFrontmatter: () => {},
    onModeApplied: () => {},
    persistMode: false,
    isExternallyManaged,
  });
}

describe("sourceModeController 比較モード分離", () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.contentEl.remove();
  });

  const hasTextarea = (): boolean =>
    ctx.contentEl.querySelector("[data-am-source-textarea]") !== null;

  it("非管理: switchTo('source') で standalone textarea を生成する（従来動作・不変）", () => {
    const c = makeController(ctx, () => false);
    c.switchTo("source");
    expect(hasTextarea()).toBe(true);
    expect(ctx.editor.view.dom.style.display).toBe("none");
    c.destroy();
  });

  it("管理中: switchTo('source') では standalone DOM を出さず mode/text だけ更新する", () => {
    const c = makeController(ctx, () => true);
    c.switchTo("source");
    // standalone textarea を生成しない。
    expect(hasTextarea()).toBe(false);
    // 比較ビュー右ペインのエディタを隠さない（display を変更しない）。
    expect(ctx.editor.view.dom.style.display).not.toBe("none");
    // mode はストアとして source を保持する。
    expect(c.getMode()).toBe("source");
    // テキストストアとして読み書きできる。
    c.setSourceText("X");
    expect(c.getSourceText()).toBe("X");
    c.destroy();
  });

  it("detachStandaloneUi: standalone textarea を撤去し editor 表示を戻す（mode は保持）", () => {
    const c = makeController(ctx, () => false);
    c.switchTo("source");
    expect(hasTextarea()).toBe(true);
    expect(ctx.editor.view.dom.style.display).toBe("none");

    c.detachStandaloneUi();
    expect(hasTextarea()).toBe(false);
    expect(ctx.editor.view.dom.style.display).not.toBe("none");
    expect(c.getMode()).toBe("source");
    c.destroy();
  });

  it("attachStandaloneUi: source モードなら standalone textarea を生成する（比較 exit 想定）", () => {
    let managed = true;
    const c = makeController(ctx, () => managed);
    c.switchTo("source"); // 管理中 → DOM 出さず
    expect(hasTextarea()).toBe(false);

    managed = false; // 比較 exit
    c.attachStandaloneUi();
    expect(hasTextarea()).toBe(true);
    c.destroy();
  });

  it("attachStandaloneUi: wysiwyg モードでは何もしない", () => {
    let managed = true;
    const c = makeController(ctx, () => managed);
    // 既定 wysiwyg のまま比較 exit。
    managed = false;
    c.attachStandaloneUi();
    expect(hasTextarea()).toBe(false);
    c.destroy();
  });
});
