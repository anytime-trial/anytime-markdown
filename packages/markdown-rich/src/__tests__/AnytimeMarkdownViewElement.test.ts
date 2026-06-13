/**
 * `<anytime-markdown-view>`（read-only 表示）の検証。
 *
 * rich と同様に重量 mount をモックし、view 要素が mount オプションへ
 * readOnly / viewerToolbar（font/theme のみの最小ツールバー）/ hideStatusBar を強制することを確認する。
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
  // 実 base 同様に options をマージして mountEditor へ渡す忠実なスタブ。
  class AnytimeMarkdownEditorElement extends HTMLElement {
    protected handle: { destroy(): void } | null = null;
    private opts: Record<string, unknown> = {};
    set options(v: Record<string, unknown>) {
      this.opts = v ?? {};
    }
    get options(): Record<string, unknown> {
      return this.opts;
    }
    connectedCallback(): void {
      this.handle = (this as unknown as {
        mountEditor(c: HTMLElement, o: unknown): { destroy(): void };
      }).mountEditor(this, { t: () => "", initialContent: "", ...this.opts });
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

import "../view-element";
import { AnytimeMarkdownViewElement } from "../AnytimeMarkdownViewElement";

afterEach(() => {
  document.body.innerHTML = "";
  mountSpy.mockClear();
});

describe("AnytimeMarkdownViewElement", () => {
  it("anytime-markdown-view タグが登録される", () => {
    expect(customElements.get("anytime-markdown-view")).toBe(AnytimeMarkdownViewElement);
  });

  it("read-only + viewerToolbar（font/theme のみ）+ statusbar 非表示 を強制する", () => {
    const el = document.createElement("anytime-markdown-view");
    document.body.appendChild(el);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    const options = mountSpy.mock.calls[0][1] as {
      readOnly?: boolean;
      viewerToolbar?: boolean;
      hideStatusBar?: boolean;
      hideToolbar?: boolean;
    };
    expect(options.readOnly).toBe(true);
    expect(options.viewerToolbar).toBe(true);
    expect(options.hideStatusBar).toBe(true);
    // 編集ツールバー抑止は viewerToolbar 側で行うため hideToolbar は強制しない。
    expect(options.hideToolbar).toBeUndefined();
  });

  it("consumer が渡したスクロール等の表示オプションはそのまま尊重する", () => {
    const el = document.createElement("anytime-markdown-view") as InstanceType<
      typeof AnytimeMarkdownViewElement
    >;
    el.options = { noScroll: true };
    document.body.appendChild(el);
    const options = mountSpy.mock.calls[0][1] as { noScroll?: boolean; readOnly?: boolean };
    expect(options.noScroll).toBe(true);
    expect(options.readOnly).toBe(true);
  });
});
