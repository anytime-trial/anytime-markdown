/**
 * GifBlockContent.ts — content-only native NodeView のテスト
 * （編集 chrome は GifBlockOverlay 側で検証する）
 */
import {
  createGifBlockNodeView,
  GIF_RECORD_INTENT_EVENT,
} from "../components/GifBlockContent";

function makeView(
  attrs: Record<string, unknown>,
  opts: { isEditable?: boolean; pos?: number } = {},
) {
  const editor = { isEditable: opts.isEditable ?? true } as any;
  const node = { attrs, type: { name: "gifBlock" } } as any;
  return createGifBlockNodeView({
    node,
    editor,
    getPos: () => opts.pos ?? 3,
  });
}

describe("createGifBlockNodeView (native content NodeView)", () => {
  it("renders the placeholder when there is no src", () => {
    const view = makeView({ src: null });
    expect(view.dom).toBeInstanceOf(HTMLElement);
    expect((view.dom as HTMLElement).textContent).toContain("Click to record GIF");
    expect((view.dom as HTMLElement).querySelector("img")).toBeNull();
  });

  it("renders the image when src is provided", () => {
    const view = makeView({ src: "test.gif", alt: "demo" });
    const img = (view.dom as HTMLElement).querySelector("img");
    expect(img?.getAttribute("src")).toBe("test.gif");
    expect(img?.getAttribute("alt")).toBe("demo");
  });

  it("swaps placeholder → image on update()", () => {
    const view = makeView({ src: null });
    const handled = view.update?.(
      { type: { name: "gifBlock" }, attrs: { src: "x.gif", alt: "" } } as any,
      [],
      null as any,
    );
    expect(handled).toBe(true);
    expect((view.dom as HTMLElement).querySelector("img")?.getAttribute("src")).toBe(
      "x.gif",
    );
  });

  it("toggles selection outline and playback button via selectNode / deselectNode", () => {
    const view = makeView({ src: "x.gif" });
    const dom = view.dom as HTMLElement;
    const btn = dom.querySelector("button") as HTMLButtonElement;

    view.selectNode?.();
    expect(dom.style.outline).toContain("var(--am-color-primary-main)");
    expect(btn.style.display).toBe("block");

    view.deselectNode?.();
    expect(dom.style.outline).toBe("");
    expect(btn.style.display).toBe("none");
  });

  it("emits a record-intent event with the node pos when the placeholder is clicked", () => {
    const view = makeView({ src: null }, { isEditable: true, pos: 7 });
    const dom = view.dom as HTMLElement;
    let detailPos: number | null = null;
    dom.addEventListener(GIF_RECORD_INTENT_EVENT, (e) => {
      detailPos = (e as CustomEvent).detail.pos;
    });

    const placeholder = dom.querySelector("div") as HTMLElement;
    placeholder.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(detailPos).toBe(7);
  });

  it("does not emit a record-intent event when the editor is read-only", () => {
    const view = makeView({ src: null }, { isEditable: false });
    const dom = view.dom as HTMLElement;
    const spy = jest.fn();
    dom.addEventListener(GIF_RECORD_INTENT_EVENT, spy);

    (dom.querySelector("div") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
