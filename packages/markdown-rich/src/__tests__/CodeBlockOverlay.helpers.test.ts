/**
 * CodeBlockOverlay.tsx の純関数 helper（ラベル解決・選択折畳み transaction）テスト。
 * overlay の React レンダリングは S3b（ダイアログ追加時）でまとめて検証する。
 */
import { applySelectionCollapse, codeBlockToolbarLabel } from "../components/CodeBlockOverlay";

const t = (k: string) => k;

describe("codeBlockToolbarLabel", () => {
  it("種別ごとのラベルを返す", () => {
    expect(codeBlockToolbarLabel("math", "math", t)).toBe("Math");
    expect(codeBlockToolbarLabel("html", "html", t)).toBe("htmlPreview");
    expect(codeBlockToolbarLabel("diagram", "mermaid", t)).toBe("mermaid");
    expect(codeBlockToolbarLabel("diagram", "plantuml", t)).toBe("plantuml");
    expect(codeBlockToolbarLabel("embed", "embed card", t)).toBe("Embed");
    expect(codeBlockToolbarLabel("regular", "typescript", t)).toBe("Code (typescript)");
    expect(codeBlockToolbarLabel("regular", "", t)).toBe("Code");
  });
});

interface NodeSpec { name: string; codeCollapsed: boolean }

function mockEditor(nodes: Record<number, NodeSpec | undefined>, contentSize = 100) {
  const setNodeAttribute = jest.fn();
  const editor = {
    state: {
      doc: {
        content: { size: contentSize },
        nodeAt: (p: number) => {
          const n = nodes[p];
          return n ? { type: { name: n.name }, attrs: { codeCollapsed: n.codeCollapsed } } : null;
        },
      },
    },
    chain: () => ({
      command: (fn: (ctx: { tr: { setNodeAttribute: typeof setNodeAttribute } }) => boolean) => {
        fn({ tr: { setNodeAttribute } });
        return { run: jest.fn() };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { editor, setNodeAttribute };
}

describe("applySelectionCollapse", () => {
  it("選択した codeBlock を展開する（codeCollapsed=false）", () => {
    const { editor, setNodeAttribute } = mockEditor({ 5: { name: "codeBlock", codeCollapsed: true } });
    applySelectionCollapse(editor, -1, 5);
    expect(setNodeAttribute).toHaveBeenCalledWith(5, "codeCollapsed", false);
  });

  it("選択を外れた前の codeBlock を折畳む（codeCollapsed=true）", () => {
    const { editor, setNodeAttribute } = mockEditor({ 5: { name: "codeBlock", codeCollapsed: false } });
    applySelectionCollapse(editor, 5, -1);
    expect(setNodeAttribute).toHaveBeenCalledWith(5, "codeCollapsed", true);
  });

  it("別の codeBlock へ移動: 前を折畳み・新を展開する", () => {
    const { editor, setNodeAttribute } = mockEditor({
      3: { name: "codeBlock", codeCollapsed: false },
      9: { name: "codeBlock", codeCollapsed: true },
    });
    applySelectionCollapse(editor, 3, 9);
    expect(setNodeAttribute).toHaveBeenCalledWith(3, "codeCollapsed", true);
    expect(setNodeAttribute).toHaveBeenCalledWith(9, "codeCollapsed", false);
  });

  it("既に展開済みかつ前なし: 何も書き換えない", () => {
    const { editor, setNodeAttribute } = mockEditor({ 5: { name: "codeBlock", codeCollapsed: false } });
    applySelectionCollapse(editor, -1, 5);
    expect(setNodeAttribute).not.toHaveBeenCalled();
  });

  it("前 pos が codeBlock でなければ触らない", () => {
    const { editor, setNodeAttribute } = mockEditor({ 4: { name: "paragraph", codeCollapsed: false } });
    applySelectionCollapse(editor, 4, -1);
    expect(setNodeAttribute).not.toHaveBeenCalled();
  });
});
