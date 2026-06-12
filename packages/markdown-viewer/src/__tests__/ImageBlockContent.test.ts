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
      '[role="slider"]',
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
      '[role="slider"]',
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
});
