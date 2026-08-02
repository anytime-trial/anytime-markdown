/**
 * sourceModeController のテーマ追従リグレッションテスト。
 *
 * ソースモードの textarea は `.tiptap` の兄弟（contentEl 直下）に置かれるため、
 * `.tiptap { color: var(--am-editor-text) }` を継承できない。以前は `color:inherit`
 * だったため、テーマ非対応の素ページ（ブラウザ拡張等）ではダーク時もページ既定の黒文字に
 * なり読めなかった。textarea が host 適用の `--am-editor-text` を直接参照することを保証する。
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

describe("sourceModeController テーマ追従", () => {
  let contentEl: HTMLElement;

  beforeEach(() => {
    contentEl = document.createElement("div");
    document.body.appendChild(contentEl);
  });

  afterEach(() => {
    contentEl.remove();
  });

  it("source textarea の文字色は --am-editor-text を参照する（color:inherit ではない）", () => {
    const controller = createController(contentEl);
    controller.switchTo("source");

    const textarea = controller.getTextarea();
    expect(textarea).not.toBeNull();
    // host が root へ適用する --am-editor-text を直接参照することで、.tiptap の兄弟でも
    // テーマ文字色に追従する。素ページの既定黒（color:inherit）へ落ちないことを保証する。
    expect(textarea?.style.color).toContain("--am-editor-text");

    controller.destroy();
  });
});
