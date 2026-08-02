/**
 * `<anytime-markdown-view>`（lean read-only 表示）の検証。
 * 重量 mount をモックし、view 要素が mount オプションへ
 * readOnly / viewerToolbar / hideStatusBar を強制することを確認する。
 */
const mountSpy = jest.fn();

jest.mock("../host/vanillaMarkdownEditor", () => ({
  mountVanillaMarkdownEditor: (container: HTMLElement, options: unknown) => {
    mountSpy(container, options);
    const root = document.createElement("div");
    root.setAttribute("data-am-editor-root", "");
    container.appendChild(root);
    return { editor: {}, root, update: jest.fn(), destroy: jest.fn(() => root.remove()) };
  },
}));

import "../view-element";
import { AnytimeMarkdownViewElement } from "../AnytimeMarkdownViewElement";

afterEach(() => {
  document.body.innerHTML = "";
  mountSpy.mockClear();
});

describe("AnytimeMarkdownViewElement (lean)", () => {
  it("anytime-markdown-view タグが登録される", () => {
    expect(customElements.get("anytime-markdown-view")).toBe(AnytimeMarkdownViewElement);
  });

  it("read-only + viewerToolbar + statusbar 非表示 を強制する", () => {
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
    expect(options.hideToolbar).toBeUndefined();
  });

  it("consumer が渡した表示オプションは尊重する", () => {
    const el = document.createElement("anytime-markdown-view") as InstanceType<
      typeof AnytimeMarkdownViewElement
    >;
    el.options = { noScroll: true } as Record<string, unknown>;
    document.body.appendChild(el);
    const options = mountSpy.mock.calls[0][1] as { noScroll?: boolean; readOnly?: boolean };
    expect(options.noScroll).toBe(true);
    expect(options.readOnly).toBe(true);
  });
});
