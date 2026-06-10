/**
 * host/vanillaMarkdownEditor.ts（G3-1 draft）の smoke テスト。
 *
 * vanilla オーケストレーターが editor を mount し、core chrome（StatusBar）を配置し、destroy で
 * 後始末することを検証する。React/JSX は使わない。重量系 chrome は TODO seam のため未検証。
 *
 * jsdom の罠回避: getComputedStyle で CSS 変数を検証せず、要素の存在/属性/接続状態を見る。
 */

// buildEditorExtensions は lowlight（ESM）を引き込み jest が解析できないため、最小の実拡張
// （StarterKit）へ mock する（editor mount に必要なスキーマを満たす）。
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

describe("mountVanillaMarkdownEditor (G3-1 draft)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("container に editor root を mount し core chrome を配置する", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# Hello" });

    // root レイアウト + slot 構成。
    const root = container.querySelector("[data-am-editor-root]") as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.querySelector("[data-am-toolbar-slot]")).toBeTruthy();
    expect(root.querySelector("[data-am-content]")).toBeTruthy();
    expect(root.querySelector("[data-am-statusbar-slot]")).toBeTruthy();

    // editor が mount され、StatusBar（statusbar slot 配下）が配置される。
    expect(handle.editor).toBeTruthy();
    expect(handle.editor.isDestroyed).toBe(false);
    expect(root.querySelector("[data-am-statusbar-slot]")?.children.length).toBeGreaterThan(0);

    handle.destroy();
  });

  it("readOnly では editor が editable=false で mount される", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, readOnly: true });
    expect(handle.editor.isEditable).toBe(false);
    handle.destroy();
  });

  it("destroy で editor を破棄し root を container から除去する", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    const editor = handle.editor;
    handle.destroy();
    expect(editor.isDestroyed).toBe(true);
    expect(container.querySelector("[data-am-editor-root]")).toBeNull();
  });
});
