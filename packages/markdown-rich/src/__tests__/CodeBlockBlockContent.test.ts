/**
 * CodeBlockBlockContent.ts — content-only native NodeView のテスト（S2a 骨格）。
 * 編集 chrome は CodeBlockOverlay 側で検証する（S3）。
 */
import {
  classifyCodeBlock,
  createCodeBlockNodeView,
  CODE_BLOCK_EDIT_INTENT_EVENT,
} from "../components/codeblock/CodeBlockBlockContent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeView(attrs: Record<string, unknown>, opts: { pos?: number } = {}): any {
  const editor = { commands: { setTextSelection: jest.fn() } } as any;
  const node = { attrs, type: { name: "codeBlock" }, textContent: attrs.text ?? "" } as any;
  return createCodeBlockNodeView({ node, editor, getPos: () => opts.pos ?? 3 });
}

describe("classifyCodeBlock", () => {
  it("language から種別を判定する", () => {
    expect(classifyCodeBlock("math")).toBe("math");
    expect(classifyCodeBlock("html")).toBe("html");
    expect(classifyCodeBlock("mermaid")).toBe("diagram");
    expect(classifyCodeBlock("plantuml")).toBe("diagram");
    expect(classifyCodeBlock("embed")).toBe("embed");
    expect(classifyCodeBlock("embed card")).toBe("embed");
    expect(classifyCodeBlock("typescript")).toBe("regular");
    expect(classifyCodeBlock(null)).toBe("regular");
  });
});

describe("createCodeBlockNodeView (native content NodeView)", () => {
  it("dom と contentDOM(code) を構築する", () => {
    const view = makeView({ language: "typescript" });
    expect(view.dom).toBeInstanceOf(HTMLElement);
    expect(view.contentDOM).toBeInstanceOf(HTMLElement);
    expect((view.contentDOM as HTMLElement).tagName).toBe("CODE");
    expect((view.dom as HTMLElement).querySelector("pre")?.contains(view.contentDOM)).toBe(true);
    expect((view.contentDOM as HTMLElement).className).toBe("language-typescript");
  });

  it("regular はコード常時表示・プレビュー非表示・maxHeight 400", () => {
    const view = makeView({ language: "typescript", codeCollapsed: true });
    const dom = view.dom as HTMLElement;
    const preWrap = dom.querySelector("pre")!.parentElement as HTMLElement;
    const preview = dom.querySelector(".rich-codeblock-preview") as HTMLElement;
    expect(preWrap.style.display).toBe(""); // collapsed でも regular は表示
    expect(preview.style.display).toBe("none");
    expect((dom.querySelector("pre") as HTMLElement).style.maxHeight).toBe("400px");
  });

  it("preview 種別 collapsed=true でコードを隠しプレビューを出す・枠線なし", () => {
    const view = makeView({ language: "math", codeCollapsed: true });
    const dom = view.dom as HTMLElement;
    const preWrap = dom.querySelector("pre")!.parentElement as HTMLElement;
    const frame = dom.querySelector(".rich-codeblock-frame") as HTMLElement;
    expect(preWrap.style.display).toBe("none");
    expect((dom.querySelector(".rich-codeblock-preview") as HTMLElement).style.display).toBe("");
    expect((dom.querySelector("pre") as HTMLElement).style.maxHeight).toBe("200px");
    expect(frame.style.borderColor).toBe("transparent");
  });

  it("preview 種別 collapsed=false でコード表示・枠線あり", () => {
    const view = makeView({ language: "mermaid", codeCollapsed: false });
    const dom = view.dom as HTMLElement;
    const preWrap = dom.querySelector("pre")!.parentElement as HTMLElement;
    const frame = dom.querySelector(".rich-codeblock-frame") as HTMLElement;
    expect(preWrap.style.display).toBe("");
    expect(frame.style.borderColor).toContain("--am-color-divider");
  });

  it("update() で language 変更時に種別と code class を更新する", () => {
    const view = makeView({ language: "typescript" });
    const handled = view.update(
      { type: { name: "codeBlock" }, attrs: { language: "math", codeCollapsed: true }, textContent: "" } as any,
    );
    expect(handled).toBe(true);
    expect((view.contentDOM as HTMLElement).className).toBe("language-math");
    // math は preview 種別になり collapsed でコードが隠れる
    const preWrap = (view.dom as HTMLElement).querySelector("pre")!.parentElement as HTMLElement;
    expect(preWrap.style.display).toBe("none");
  });

  it("update() は異なる node type で false を返す", () => {
    const view = makeView({ language: "typescript" });
    expect(view.update({ type: { name: "paragraph" }, attrs: {}, textContent: "" } as any)).toBe(false);
  });

  it("preview 種別の dblclick で編集インテントを pos 付きで発火する", () => {
    const view = makeView({ language: "mermaid" }, { pos: 11 });
    const dom = view.dom as HTMLElement;
    let detailPos: number | null = null;
    dom.addEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, (e) => {
      detailPos = (e as CustomEvent).detail.pos;
    });
    dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(detailPos).toBe(11);
  });

  it("regular の dblclick では編集インテントを発火しない", () => {
    const view = makeView({ language: "typescript" });
    const dom = view.dom as HTMLElement;
    const spy = jest.fn();
    dom.addEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, spy);
    dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignoreMutation: selection は false / preview 内は true / code 内は false", () => {
    const view = makeView({ language: "math", codeCollapsed: false });
    const dom = view.dom as HTMLElement;
    const preview = dom.querySelector(".rich-codeblock-preview") as HTMLElement;
    expect(view.ignoreMutation({ type: "selection", target: dom } as any)).toBe(false);
    expect(view.ignoreMutation({ type: "childList", target: preview } as any)).toBe(true);
    expect(view.ignoreMutation({ type: "characterData", target: view.contentDOM } as any)).toBe(false);
  });

  it("プレビュークリックでブロックへ選択を移す", () => {
    const editorSpy = jest.fn();
    const node = { attrs: { language: "math", codeCollapsed: true }, type: { name: "codeBlock" }, textContent: "" } as any;
    const view = createCodeBlockNodeView({
      node,
      editor: { commands: { setTextSelection: editorSpy } } as any,
      getPos: () => 5,
    });
    const preview = (view.dom as HTMLElement).querySelector(".rich-codeblock-preview") as HTMLElement;
    preview.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(editorSpy).toHaveBeenCalledWith(6); // pos + 1
  });
});
