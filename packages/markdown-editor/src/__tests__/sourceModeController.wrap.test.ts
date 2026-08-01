/**
 * sourceModeController の「ソースモード折り返し」リグレッションテスト。
 *
 * 以前は textarea が white-space:pre 固定で、幅を狭めても折り返さず横スクロールだった
 * （行番号と 1:1 対応させるコードエディタ流の意図的設計）。比較モード（MergeEditorPanel）は
 * pre-wrap で折り返しつつ、ミラーで各論理行の折り返し高さを計測して行番号ガターへ同期する。
 * ソースモードも同方式へ揃え、折り返し＋行番号整列を両立することを保証する。
 */

import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";

import { createSourceModeController } from "../host/sourceModeController";

const t = (key: string): string => key;

function createController(contentEl: HTMLElement) {
  const editor = new Editor({ extensions: [StarterKit], content: "# Hello" });
  contentEl.appendChild(editor.view.dom);
  return createSourceModeController({
    editor,
    contentEl,
    t,
    getFrontmatter: () => null,
    setFrontmatter: () => {},
    onModeApplied: () => {},
    persistMode: false,
  });
}

describe("sourceModeController 折り返し", () => {
  let contentEl: HTMLElement;

  beforeEach(() => {
    contentEl = document.createElement("div");
    document.body.appendChild(contentEl);
  });

  afterEach(() => {
    contentEl.remove();
  });

  it("source textarea は pre-wrap で折り返す（横スクロール固定の pre にしない）", () => {
    const controller = createController(contentEl);
    controller.switchTo("source");

    const textarea = controller.getTextarea();
    expect(textarea).not.toBeNull();
    // 比較モードと同じく折り返す。以前の white-space:pre（折り返し無効）への回帰を防ぐ。
    expect(textarea?.style.whiteSpace).toBe("pre-wrap");

    controller.destroy();
  });

  it("行番号ガターとミラーが論理行ごとの個別要素で構成される（高さ同期の前提）", () => {
    const controller = createController(contentEl);
    controller.switchTo("source");
    controller.setSourceText("a\nb\nc");

    const wrap = contentEl.querySelector("[data-am-source-wrap]");
    const gutter = wrap?.querySelector("[data-am-source-gutter]");
    const mirror = wrap?.querySelector("[data-am-source-mirror]");

    expect(gutter).toBeTruthy();
    expect(mirror).toBeTruthy();
    // 折り返し後の各論理行高さを 1:1 で同期するため、ガター/ミラーとも 3 行分の子要素を持つ。
    expect(gutter?.children.length).toBe(3);
    expect(mirror?.children.length).toBe(3);
    expect(Array.from(gutter!.children).map((c) => c.textContent)).toEqual(["1", "2", "3"]);

    controller.destroy();
  });

  it("ミラーは textarea と同じ pre-wrap で折り返し高さを計測する", () => {
    const controller = createController(contentEl);
    controller.switchTo("source");

    const mirror = contentEl.querySelector<HTMLElement>("[data-am-source-mirror]");
    expect(mirror).not.toBeNull();
    expect(mirror?.style.whiteSpace).toBe("pre-wrap");
    expect(mirror?.style.overflowWrap).toBe("break-word");

    controller.destroy();
  });

  it("非表示→再表示で行高同期が再スケジュールされる（保留 rAF の取りこぼし回帰）", () => {
    // rAF を発火させず捕捉のみ。source 表示中に保留した同期 rAF が、wysiwyg へ抜けた後も
    // syncScheduled=true のまま残ると、次の source 表示で scheduleSync がスキップされ初期
    // applyHeights が走らない。doHideTextarea で syncScheduled を reset することを保証する。
    const raf = jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 0 as unknown as number);
    try {
      const controller = createController(contentEl);
      controller.switchTo("source"); // 同期を rAF にキュー（発火させない）→ syncScheduled=true
      const afterFirstShow = raf.mock.calls.length;
      expect(afterFirstShow).toBeGreaterThan(0);

      controller.switchTo("wysiwyg"); // doHideTextarea が syncScheduled を reset
      controller.switchTo("source"); // reset されていれば再び scheduleSync が rAF を積む
      expect(raf.mock.calls.length).toBeGreaterThan(afterFirstShow);

      controller.destroy();
    } finally {
      raf.mockRestore();
    }
  });
});
