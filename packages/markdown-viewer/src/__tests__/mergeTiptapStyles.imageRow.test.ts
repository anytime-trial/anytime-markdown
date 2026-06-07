/**
 * Regression: 比較（マージ）モードと通常モードのスタイルパリティ。
 *
 * 元は「連続画像（README バッジ）が比較モードで縦並びになる」不具合の回帰テスト。
 * 比較ビュー mergeTiptapStyles が独自再実装だったため imageRow の flex 欠落・
 * admonition 欠落・シンタックスハイライト欠落などが生じていた。
 * 共有スタイル関数の合成へ移行したことで通常モードと一致することを保証する。
 */
import { getMergeTiptapStyles } from "../components/mergeTiptapStyles";
import { DEFAULT_SETTINGS } from "../useEditorSettings";

function tiptapOf(isDark: boolean) {
  return getMergeTiptapStyles(isDark, DEFAULT_SETTINGS, { showHoverLabels: true })["& .tiptap"] as Record<string, any>;
}

describe("getMergeTiptapStyles parity (regression)", () => {
  it("lays out [data-image-row] horizontally with flex wrap", () => {
    const tiptap = tiptapOf(true);
    const imageRow = tiptap["& [data-image-row]"];
    expect(imageRow).toBeDefined();
    expect(String(imageRow.display)).toContain("flex");
    expect(imageRow.flexWrap).toBe("wrap");
  });

  it("includes admonition decoration (blockquote[data-admonition-type])", () => {
    const tiptap = tiptapOf(true);
    expect(tiptap["& blockquote[data-admonition-type='note']"]).toBeDefined();
    expect(tiptap["& blockquote[data-admonition-type='warning']"]).toBeDefined();
  });

  it("includes syntax highlight (hljs) styles inside pre", () => {
    const tiptap = tiptapOf(true);
    const pre = tiptap["& pre"];
    expect(pre).toBeDefined();
    const hljsKey = Object.keys(pre).find((k) => k.includes(".hljs-keyword"));
    expect(hljsKey).toBeDefined();
  });

  it("includes heading left-border decoration (h1)", () => {
    const tiptap = tiptapOf(true);
    expect(tiptap["& h1"].borderLeft).toBeDefined();
  });

  it("applies imageRow flex layout in light mode too", () => {
    const tiptap = tiptapOf(false);
    expect(String(tiptap["& [data-image-row]"].display)).toContain("flex");
  });
});
