/**
 * `<anytime-markdown-view>`（read-only 最小表示）の検証。
 *
 * rich と同様に重量 mount をモックし、view 要素が mount オプションへ
 * readOnly / hideToolbar / hideStatusBar を強制することを確認する。
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

  it("read-only・chromeless を mount オプションへ強制する", () => {
    const el = document.createElement("anytime-markdown-view");
    document.body.appendChild(el);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    const options = mountSpy.mock.calls[0][1] as {
      readOnly?: boolean;
      hideToolbar?: boolean;
      hideStatusBar?: boolean;
    };
    expect(options.readOnly).toBe(true);
    expect(options.hideToolbar).toBe(true);
    expect(options.hideStatusBar).toBe(true);
  });
});
