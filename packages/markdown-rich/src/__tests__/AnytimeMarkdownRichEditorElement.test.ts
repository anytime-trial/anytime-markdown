/**
 * `<anytime-markdown-rich-editor>` Web Component のユニットテスト。
 *
 * markdown-viewer barrel は heavy（lowlight ESM 等）なため、既存 rich テストと同様に barrel を
 * モックする。基底 `AnytimeMarkdownEditorElement` は mountEditor template-method を呼ぶ忠実な
 * スタブで置換し、本テストはサブクラスの override（rich mount を hideGraph 付きで呼ぶ配線）を検証する。
 * 基底クラス本体の挙動は markdown-viewer 側の単体テストでカバー済み。
 */

const mountSpy = jest.fn();

jest.mock("../vanilla/mountVanillaRichMarkdownEditor", () => ({
  mountVanillaRichMarkdownEditor: (container: HTMLElement, options: unknown) => {
    mountSpy(container, options);
    const root = document.createElement("div");
    root.setAttribute("data-am-editor-root", "");
    container.appendChild(root);
    return { editor: {}, root, update: jest.fn(), destroy: jest.fn(() => root.remove()) };
  },
}));

jest.mock("@anytime-markdown/markdown-viewer", () => {
  // 基底の mountEditor template-method を忠実に再現するスタブ。
  class AnytimeMarkdownEditorElement extends HTMLElement {
    protected handle: { destroy(): void } | null = null;
    connectedCallback(): void {
      this.handle = (this as unknown as {
        mountEditor(c: HTMLElement, o: unknown): { destroy(): void };
      }).mountEditor(this, { t: () => "", initialContent: "" });
    }
    disconnectedCallback(): void {
      this.handle?.destroy();
      this.handle = null;
    }
    protected mountEditor(_c: HTMLElement, _o: unknown): { destroy(): void } {
      throw new Error("mountEditor must be overridden");
    }
  }
  return { AnytimeMarkdownEditorElement };
});

import "../element";
import { AnytimeMarkdownRichEditorElement } from "../AnytimeMarkdownRichEditorElement";

afterEach(() => {
  document.body.innerHTML = "";
  mountSpy.mockClear();
});

describe("AnytimeMarkdownRichEditorElement", () => {
  it("anytime-markdown-rich-editor タグが登録される", () => {
    expect(customElements.get("anytime-markdown-rich-editor")).toBe(
      AnytimeMarkdownRichEditorElement,
    );
  });

  it("connect で rich mount を hideGraph=false で呼ぶ", () => {
    const el = document.createElement("anytime-markdown-rich-editor");
    document.body.appendChild(el);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    const options = mountSpy.mock.calls[0][1] as { hideGraph?: boolean };
    expect(options.hideGraph).toBe(false);
    expect(el.querySelector("[data-am-editor-root]")).not.toBeNull();
  });

  it("hide-graph 属性で hideGraph=true を渡す", () => {
    const el = document.createElement("anytime-markdown-rich-editor");
    el.setAttribute("hide-graph", "");
    document.body.appendChild(el);
    const options = mountSpy.mock.calls[0][1] as { hideGraph?: boolean };
    expect(options.hideGraph).toBe(true);
  });

  it("disconnect で破棄する", () => {
    const el = document.createElement("anytime-markdown-rich-editor");
    document.body.appendChild(el);
    el.remove();
    expect(el.querySelector("[data-am-editor-root]")).toBeNull();
  });
});
