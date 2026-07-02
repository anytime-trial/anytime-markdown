/**
 * ImageBlockContent.ts — content-only native NodeView のテスト。
 * （編集 chrome は imageBlockChrome / ImageDialogHost で検証する）
 */
import { createImageBlockNodeView } from "../components/ImageBlockContent";

function makeView(
  attrs: Record<string, unknown>,
  opts: { isEditable?: boolean; pos?: number; commandSink?: any[] } = {},
) {
  const sink = opts.commandSink ?? [];
  const chain = () => {
    const c: any = {
      command: (fn: any) => {
        sink.push(fn);
        return c;
      },
      run: () => true,
    };
    return c;
  };
  const editor = { isEditable: opts.isEditable ?? true, chain } as any;
  const node = { attrs, type: { name: "image" } } as any;
  return createImageBlockNodeView({
    node,
    editor,
    getPos: () => opts.pos ?? 3,
  });
}

describe("createImageBlockNodeView (native content NodeView)", () => {
  it("renders the image with src/alt", () => {
    const view = makeView({ src: "p.png", alt: "pic" });
    const img = (view.dom as HTMLElement).querySelector("img");
    expect(img?.getAttribute("src")).toBe("p.png");
    expect(img?.getAttribute("alt")).toBe("pic");
  });

  it("falls back to a default alt when none is given", () => {
    const view = makeView({ src: "p.png", alt: "" });
    expect(
      (view.dom as HTMLElement).querySelector("img")?.getAttribute("alt"),
    ).toBe("image");
  });

  it("shows an error box when the image fails to load", () => {
    const view = makeView({ src: "broken.png", alt: "" });
    const img = (view.dom as HTMLElement).querySelector("img") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));
    expect((view.dom as HTMLElement).querySelector("img")).toBeNull();
  });

  it("error box は role=img + aria-label でスクリーンリーダーに失敗を伝える", () => {
    const view = makeView({ src: "broken.png", alt: "" });
    const img = (view.dom as HTMLElement).querySelector("img") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));
    const errorBox = (view.dom as HTMLElement).querySelector('[role="img"]') as HTMLElement;
    expect(errorBox).toBeTruthy();
    // t 未指定時は identityT フォールバックでキーがそのまま入る。
    expect(errorBox.getAttribute("aria-label")).toBe("imageLoadError");
  });

  it("i18n: t を渡すと resize handle / error box の aria-label が翻訳される", () => {
    const t = (key: string): string =>
      key === "resizeImage" ? "画像のリサイズ" : key === "imageLoadError" ? "読み込み失敗" : key;
    const editor = { isEditable: true, chain: () => ({ command: () => ({ run: () => true }) }) } as any;
    const node = { attrs: { src: "broken.png", alt: "" }, type: { name: "image" } } as any;
    const view = createImageBlockNodeView({ node, editor, getPos: () => 3, t });
    const handle = (view.dom as HTMLElement).querySelector(
      "[data-am-resize-handle]",
    ) as HTMLElement;
    expect(handle.getAttribute("aria-label")).toBe("画像のリサイズ");

    const img = (view.dom as HTMLElement).querySelector("img") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));
    const errorBox = (view.dom as HTMLElement).querySelector('[role="img"]') as HTMLElement;
    expect(errorBox.getAttribute("aria-label")).toBe("読み込み失敗");
  });

  it("renders annotations as an SVG overlay", () => {
    const annotations = JSON.stringify([
      { id: "a", type: "rect", x1: 0, y1: 0, x2: 10, y2: 10, color: "#f00" },
    ]);
    const view = makeView({ src: "p.png", alt: "x", annotations });
    expect((view.dom as HTMLElement).querySelector("svg")).not.toBeNull();
  });

  it("reflects a new src on update()", () => {
    const view = makeView({ src: "a.png", alt: "x" });
    view.update?.(
      { type: { name: "image" }, attrs: { src: "b.png", alt: "x" } } as any,
      [],
      null as any,
    );
    expect(
      (view.dom as HTMLElement).querySelector("img")?.getAttribute("src"),
    ).toBe("b.png");
  });

  it("shows the resize handle only while selected and editable", () => {
    const view = makeView({ src: "p.png", alt: "x" });
    const handle = (view.dom as HTMLElement).querySelector(
      "[data-am-resize-handle]",
    ) as HTMLElement;
    expect(handle.style.display).toBe("none");
    view.selectNode?.();
    expect(handle.style.display).toBe("block");
    view.deselectNode?.();
    expect(handle.style.display).toBe("none");
  });

  it("commits the new width via an editor command on resize pointerup", () => {
    const sink: any[] = [];
    const view = makeView({ src: "p.png", alt: "x" }, { pos: 4, commandSink: sink });
    view.selectNode?.();
    const handle = (view.dom as HTMLElement).querySelector(
      "[data-am-resize-handle]",
    ) as HTMLElement;

    // jsdom には PointerEvent が無いため、同型名の MouseEvent で代用する
    // （ハンドラは clientX のみ参照し、pointerId 経由の setPointerCapture は try/catch 済み）。
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, bubbles: true }));
    handle.dispatchEvent(new MouseEvent("pointermove", { clientX: 160, bubbles: true }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(sink.length).toBe(1);
    const tr = { setNodeAttribute: jest.fn() };
    sink[0]({ tr });
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(4, "width", expect.stringMatching(/px$/));
  });

  /**
   * 指摘34: detached ノード起因の catch がコンテキストログ無しで握りつぶしていた。
   * 既知パターン（TypeError、vendored tiptap の detached 挙動）は静かに無視し、
   * 想定外の例外だけ console.warn でログすることを固定する（posOrNull）。
   */
  it("resize commit 時に getPos が TypeError を throw した場合（既知の detached パターン）は console.warn を呼ばない", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const chain = () => ({ command: () => ({ run: () => true }), run: () => true } as any);
    const editor = { isEditable: true, chain } as any;
    const node = { attrs: { src: "p.png", alt: "x" }, type: { name: "image" } } as any;
    const view = createImageBlockNodeView({
      node,
      editor,
      getPos: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'size')");
      },
    });
    view.selectNode?.();
    const handle = (view.dom as HTMLElement).querySelector(
      "[data-am-resize-handle]",
    ) as HTMLElement;
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, bubbles: true }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("resize commit 時に getPos が想定外の例外を throw した場合は console.warn でログする", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const chain = () => ({ command: () => ({ run: () => true }), run: () => true } as any);
    const editor = { isEditable: true, chain } as any;
    const node = { attrs: { src: "p.png", alt: "x" }, type: { name: "image" } } as any;
    const view = createImageBlockNodeView({
      node,
      editor,
      getPos: () => {
        throw new Error("boom");
      },
    });
    view.selectNode?.();
    const handle = (view.dom as HTMLElement).querySelector(
      "[data-am-resize-handle]",
    ) as HTMLElement;
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, bubbles: true }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(warnSpy).toHaveBeenCalledWith(
      "[ImageBlockContent] posOrNull: unexpected error",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  /**
   * 指摘34: setPointerCapture の catch も既知パターン（DOMException / jsdom 未実装の
   * TypeError）以外は console.warn でログする。jsdom は Pointer Capture 未実装のため
   * pointerdown 自体が既に「既知パターン」を踏む（"commits the new width..." 参照）。
   * ここでは setPointerCapture 自体を想定外の型で throw させて検知されることを固定する。
   */
  it("setPointerCapture が想定外の例外を throw した場合は console.warn でログする", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const view = makeView({ src: "p.png", alt: "x" }, { pos: 4 });
    view.selectNode?.();
    const handle = (view.dom as HTMLElement).querySelector(
      "[data-am-resize-handle]",
    ) as HTMLElement;
    handle.setPointerCapture = () => {
      throw new RangeError("boom");
    };
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, bubbles: true }));

    expect(warnSpy).toHaveBeenCalledWith(
      "[ImageBlockContent] onPointerDown: unexpected error while capturing pointer",
      expect.any(RangeError),
    );
    warnSpy.mockRestore();
  });
});
