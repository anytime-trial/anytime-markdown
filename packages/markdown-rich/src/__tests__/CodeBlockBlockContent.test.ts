/**
 * CodeBlockBlockContent.ts — content-only native NodeView のテスト（S2a 骨格）。
 * 編集 chrome は codeBlockChrome / CodeDialogHost 側で検証する。
 */
const mockEmbedRender = jest.fn();
const mockEmbedDestroy = jest.fn();
const mockMountEmbedPreview = jest.fn(() => ({ render: mockEmbedRender, destroy: mockEmbedDestroy }));
// 純粋ヘルパーは previewContracts へ分離済み（React マウントは PreviewIslands レジストリ経由）。
jest.mock("../components/codeblock/previewContracts", () => ({
  ...jest.requireActual("../components/codeblock/previewContracts"),
  isEmbedResizable: jest.fn(() => true),
  getEmbedStoredWidth: jest.fn(() => null),
  buildEmbedWidthLanguage: jest.fn((_lang: string, w: string) => `embed card ${w}`),
  buildEmbedBaselineLanguage: jest.fn((lang: string) => lang),
}));

const mockGraphRender = jest.fn();
const mockGraphDestroy = jest.fn();
const mockMountGraphPreview = jest.fn(() => ({ render: mockGraphRender, destroy: mockGraphDestroy }));

import {
  classifyCodeBlock,
  createCodeBlockNodeView,
  CODE_BLOCK_EDIT_INTENT_EVENT,
} from "../components/codeblock/CodeBlockBlockContent";
import {
  registerPreviewIslands,
  resetPreviewIslands,
} from "../components/codeblock/previewIslands";

// React island（embed/graph マウント）はレジストリへスタブを登録して検証する。
beforeEach(() => {
  registerPreviewIslands({
    mountEmbedPreview: ((...args: unknown[]) => mockMountEmbedPreview(...(args as []))) as never,
    mountGraphPreview: ((...args: unknown[]) => mockMountGraphPreview(...(args as []))) as never,
  });
});

afterEach(() => {
  resetPreviewIslands();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeView(
  attrs: Record<string, unknown>,
  opts: { pos?: number; isEditable?: boolean; onSetWidth?: (cmd: unknown) => void } = {},
): any {
  const setNodeAttribute = jest.fn();
  const chain = () => ({
    command: (fn: (ctx: { tr: { setNodeAttribute: typeof setNodeAttribute } }) => boolean) => {
      fn({ tr: { setNodeAttribute } });
      return { run: jest.fn() };
    },
  });
  const editor = {
    isEditable: opts.isEditable ?? true,
    commands: { setTextSelection: jest.fn() },
    chain,
  } as any;
  const node = { attrs, type: { name: "codeBlock" }, textContent: attrs.text ?? "" } as any;
  const view = createCodeBlockNodeView({ node, editor, getPos: () => opts.pos ?? 3 });
  view.__setNodeAttribute = setNodeAttribute;
  return view;
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

  it("html プレビューを sanitize して描画する", () => {
    const view = makeView({ language: "html", codeCollapsed: false, text: "<b>hi</b><script>alert(1)</script>" });
    const inner = (view.dom as HTMLElement).querySelector(".rich-codeblock-preview > div") as HTMLElement;
    expect(inner.innerHTML).toContain("<b>hi</b>");
    expect(inner.innerHTML).not.toContain("<script>");
  });

  it("regular はプレビュー inner を空にする", () => {
    const view = makeView({ language: "typescript", text: "const x = 1" });
    const inner = (view.dom as HTMLElement).querySelector(".rich-codeblock-preview > div") as HTMLElement;
    expect(inner.childNodes.length).toBe(0);
  });

  // previewEl 直下の div: [0]=previewInner [1]=resizeGrip [2]=sizeBadge
  const gripOf = (view: { dom: HTMLElement }): HTMLElement =>
    (view.dom.querySelectorAll(".rich-codeblock-preview > div")[1]) as HTMLElement;

  it("展開中かつ編集可能でリサイズグリップを表示する", () => {
    const expanded = makeView({ language: "mermaid", codeCollapsed: false }, { isEditable: true });
    expect(gripOf(expanded).style.display).toBe("block");

    const collapsed = makeView({ language: "mermaid", codeCollapsed: true }, { isEditable: true });
    expect(gripOf(collapsed).style.display).toBe("none");

    const readOnly = makeView({ language: "mermaid", codeCollapsed: false }, { isEditable: false });
    expect(gripOf(readOnly).style.display).toBe("none");
  });

  it("リサイズドラッグで width を editor へコミットする", () => {
    // jsdom には PointerEvent が無いため MouseEvent（type=pointer*）で代用する。
    const view = makeView({ language: "mermaid", codeCollapsed: false }, { isEditable: true, pos: 4 });
    const grip = gripOf(view);
    grip.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0 }));
    grip.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 120 }));
    grip.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(view.__setNodeAttribute).toHaveBeenCalledWith(4, "width", "120px");
  });

  describe("embed", () => {
    beforeEach(() => {
      mockEmbedRender.mockClear();
      mockEmbedDestroy.mockClear();
      mockMountEmbedPreview.mockClear();
    });

    it("EmbedNodeView をマウントして描画する", () => {
      makeView({ language: "embed card", codeCollapsed: false, text: "https://x" });
      expect(mockMountEmbedPreview).toHaveBeenCalledTimes(1);
      expect(mockEmbedRender).toHaveBeenCalledTimes(1);
      const [lang, body, width, onWrite] = mockEmbedRender.mock.calls[0];
      expect(lang).toBe("embed card");
      expect(body).toBe("https://x");
      expect(width).toBeUndefined();
      expect(typeof onWrite).toBe("function");
    });

    it("リサイズは language へ width を書き戻す", () => {
      const view = makeView({ language: "embed card", codeCollapsed: false, text: "https://x" }, { isEditable: true, pos: 7 });
      const grip = gripOf(view);
      grip.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0 }));
      grip.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 90 }));
      grip.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      expect(view.__setNodeAttribute).toHaveBeenCalledWith(7, "language", "embed card 90px");
    });

    it("destroy で embed root を解放する", () => {
      const view = makeView({ language: "embed card", codeCollapsed: false, text: "https://x" });
      view.destroy();
      expect(mockEmbedDestroy).toHaveBeenCalled();
    });
  });

  describe("math graph", () => {
    beforeEach(() => {
      mockGraphRender.mockClear();
      mockGraphDestroy.mockClear();
      mockMountGraphPreview.mockClear();
    });

    it("graphEnabled=true で GraphView をマウントして描画する", () => {
      makeView({ language: "math", codeCollapsed: false, graphEnabled: true, text: "y=x^2" });
      expect(mockMountGraphPreview).toHaveBeenCalledTimes(1);
      expect(mockGraphRender).toHaveBeenCalledWith("y=x^2", true, false);
    });

    it("graphEnabled=false ではマウントしない", () => {
      makeView({ language: "math", codeCollapsed: false, graphEnabled: false, text: "y=x^2" });
      expect(mockMountGraphPreview).not.toHaveBeenCalled();
    });

    it("update で graphEnabled が false になると graph root を解放する", () => {
      const view = makeView({ language: "math", codeCollapsed: false, graphEnabled: true, text: "y=x^2" });
      expect(mockMountGraphPreview).toHaveBeenCalledTimes(1);
      view.update({ type: { name: "codeBlock" }, attrs: { language: "math", codeCollapsed: false, graphEnabled: false }, textContent: "y=x^2" } as never);
      expect(mockGraphDestroy).toHaveBeenCalled();
    });
  });
});
