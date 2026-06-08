import { getEditorPaperSx } from "../styles/editorStyles";
import { serializeGlobalStyles } from "../ui/GlobalStyle";
import type { EditorSettings } from "../useEditorSettings";

/**
 * リグレッション: MUI 削減で本文スタイルの注入経路が Paper の sx prop から
 * stylis ベースの GlobalStyle へ移行した際、sx ショートハンド(pl/py/px/bgcolor/
 * borderRadius 等)が展開されず無効プロパティとして出力され、.tiptap の左パディングが
 * 消失して hover ラベル(H1/H2 バッジ)が overflow:hidden にクリップされ不可視になった。
 * serializeGlobalStyles は sx ショートハンドを実 CSS へ展開しなければならない。
 */

const settings: EditorSettings = {
  fontSize: 16,
  lineHeight: 1.7,
  tableWidth: "auto",
  editorBg: "white",
  spellCheck: false,
  paperSize: "off",
  paperMargin: 20,
  darkBgColor: "",
  lightBgColor: "",
  darkTextColor: "",
  lightTextColor: "",
  blockAlign: "left",
  wordBreak: "normal",
};

describe("serializeGlobalStyles: MUI sx ショートハンド展開", () => {
  test("spacing ショートハンドは longhand + spacing*8 へ展開される", () => {
    const css = serializeGlobalStyles({ ".x": { pl: 2, py: 0.5, mx: 1 } });
    expect(css).toContain("padding-left:16px");
    expect(css).toContain("padding-top:4px");
    expect(css).toContain("padding-bottom:4px");
    expect(css).toContain("margin-left:8px");
    expect(css).toContain("margin-right:8px");
    expect(css).not.toMatch(/[^-]pl:/);
    expect(css).not.toMatch(/[^-]py:/);
    expect(css).not.toMatch(/[^-]mx:/);
  });

  test("bgcolor は background-color へリネームされる", () => {
    const css = serializeGlobalStyles({ ".x": { bgcolor: "rgba(0,0,0,0.1)" } });
    expect(css).toContain("background-color:rgba(0,0,0,0.1)");
    expect(css).not.toContain("bgcolor:");
  });

  test("borderRadius(数値) は shape.borderRadius(4) 倍される", () => {
    const css = serializeGlobalStyles({ ".x": { borderRadius: 0.5 } });
    expect(css).toContain("border-radius:2px");
  });

  test("border(数値) は Npx solid へ展開される", () => {
    const css = serializeGlobalStyles({ ".x": { border: 1 } });
    expect(css).toContain("border:1px solid");
  });

  test("文字列値(単位付き・var・!important)は変換されず passthrough する", () => {
    const css = serializeGlobalStyles({
      ".x": { gap: "8px", borderRadius: "var(--r, 8px)", margin: "15mm", display: "none !important" },
    });
    expect(css).toContain("gap:8px");
    expect(css).toContain("border-radius:var(--r, 8px)");
    expect(css).toContain("margin:15mm");
    expect(css).toContain("display:none!important");
  });

  test("ネストセレクタ(&:hover::before)は維持される", () => {
    const css = serializeGlobalStyles({
      ".tiptap h1": { "&::before": { opacity: 0 }, "&:hover::before": { opacity: 1 } },
    });
    expect(css).toContain(".tiptap h1::before{opacity:0;}");
    expect(css).toContain(".tiptap h1:hover::before{opacity:1;}");
  });

  test("getEditorPaperSx: .tiptap に実パディングが付き、バッジに無効プロパティが出ない", () => {
    const tiptap = getEditorPaperSx(false, settings, 600, { readonlyMode: false })["& .tiptap"] as Record<
      string,
      unknown
    >;
    const css = serializeGlobalStyles({ "#md-editor-content .tiptap": tiptap });
    // .tiptap 左パディング復活（hover バッジが gutter に収まる前提）
    expect(css).toContain("padding-left:16px");
    // 無効な sx ショートハンドが残っていない
    expect(css).not.toMatch(/[^-]pl:/);
    expect(css).not.toMatch(/[^-]py:/);
    expect(css).not.toMatch(/[^-]px:/);
    expect(css).not.toContain("bgcolor:");
    // 見出しバッジ(h1〜h5::before の共通規則)に背景色とパディングが付与される。
    // blockLabel は `& h1, ..., & h5` 配下に定義されるため、規則セレクタ末尾は h5::before。
    expect(css).toMatch(/h5::before\{[^}]*background-color:rgba\(31,30,28,0\.04\)/);
    expect(css).toMatch(/h5::before\{[^}]*padding-left:4px/);
  });
});
