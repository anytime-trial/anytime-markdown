/**
 * styles/editorContentCss.ts のユニットテスト。
 *
 * G4（React 排除）で旧 GlobalStyle 注入（getEditorPaperSx = base/heading/code/block/inline）が
 * 消失し、vanilla 経路の `.tiptap` コンテンツ装飾（見出し・hover ラベル等）が
 * ブラウザデフォルトに落ちた回帰（2026-06-11 報告）の再発防止テスト。
 *
 * buildEditorContentCss は純粋関数（isDark → CSS 文字列）として検証する。
 */

import {
  DEFAULT_DARK_HEADING_LINK,
  DEFAULT_LIGHT_HEADING_LINK,
  getTextDisabled,
} from "../constants/colors";
import { buildEditorContentCss, injectEditorContentCss } from "../styles/editorContentCss";

const SCOPE = "[data-am-editor-root]";

describe("buildEditorContentCss", () => {
  const light = buildEditorContentCss(false);
  const dark = buildEditorContentCss(true);

  it("すべてのルールが data-am-editor-root 配下にスコープされる", () => {
    const selectors = light
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((block) => block.split("{")[0]?.trim())
      .filter(
        (sel): sel is string =>
          !!sel &&
          !sel.startsWith("@") &&
          !/^\d/.test(sel) && // @keyframes 内の 0%/50%/100% 行
          !["from", "to"].includes(sel),
      );
    for (const sel of selectors) {
      for (const part of sel.split(",")) {
        expect(part.trim().startsWith(SCOPE)).toBe(true);
      }
    }
  });

  it("見出し h1〜h5 のタイポグラフィを定義する（回帰の本丸）", () => {
    expect(light).toContain(`${SCOPE} .tiptap h1`);
    expect(light).toMatch(/\.tiptap h1[^{]*\{[^}]*font-size:\s*2em/);
    expect(light).toMatch(/\.tiptap h2[^{]*\{[^}]*font-size:\s*1\.5em/);
    expect(light).toMatch(/\.tiptap h3[^{]*\{[^}]*font-size:\s*1\.25em/);
    expect(light).toMatch(/\.tiptap h4[^{]*\{[^}]*font-size:\s*1\.1em/);
    expect(light).toMatch(/\.tiptap h5[^{]*\{[^}]*font-size:\s*1em/);
  });

  it("見出しの装飾（border / gradient / handwritten 変数）を含む", () => {
    expect(light).toContain("var(--editor-heading-radius-h1, 8px)");
    expect(light).toContain("var(--editor-heading-font-family, monospace)");
    expect(light).toContain("var(--editor-heading-hatch");
    expect(light).toContain(`var(--editor-heading-border-h1, ${DEFAULT_LIGHT_HEADING_LINK})`);
    expect(dark).toContain(`var(--editor-heading-border-h1, ${DEFAULT_DARK_HEADING_LINK})`);
  });

  it("hover ブロックラベル（H1/H2/.../P/Quote/UL/OL/Task）を定義する", () => {
    for (const label of ["'H1'", "'H2'", "'H3'", "'H4'", "'H5'", "'P'", "'Quote'", "'UL'", "'OL'", "'Task'"]) {
      expect(light).toContain(`content: ${label}`);
    }
    // hover / focus-within で表示
    expect(light).toMatch(/\.tiptap h1:hover::before[^{]*\{[^}]*opacity:\s*1/);
  });

  it("readonly / review モードで hover ラベルとブロックツールバーを隠す", () => {
    expect(light).toContain('.tiptap[contenteditable="false"] h1::before');
    expect(light).toContain('.tiptap[data-review-mode="true"] h1::before');
    expect(light).toContain('.tiptap[data-readonly-mode="true"] li::before');
    expect(light).toContain("[data-block-toolbar]");
    expect(light).toContain("[data-resize-handle]");
  });

  it("プレースホルダー・インラインコード・admonition・テーブルを定義する", () => {
    expect(light).toContain("content: attr(data-placeholder)");
    expect(light).toContain(getTextDisabled(false));
    expect(light).toMatch(/\.tiptap code[^{]*\{[^}]*font-size:\s*0\.875em/);
    expect(light).toContain("blockquote[data-admonition-type='note']");
    expect(light).toContain("var(--am-editor-table-width, auto)");
  });

  it("設定値は CSS 変数（--am-editor-*）経由で参照する", () => {
    expect(light).toContain("var(--am-editor-font-size, 16px)");
    expect(light).toContain("var(--am-editor-line-height, 1.7)");
    expect(light).toContain("var(--am-editor-word-break, normal)");
    expect(light).toContain("var(--am-editor-bg");
    expect(light).toContain("var(--am-editor-text");
  });

  it("本文に measure（最大行長）上限と中央寄せを既定で与える", () => {
    expect(light).toMatch(/\.tiptap\s*\{[^}]*max-width:\s*var\(--am-editor-measure, 1000px\)/);
    expect(light).toMatch(/\.tiptap\s*\{[^}]*margin-left:\s*auto/);
  });

  it("スクロールバーは仕様6章（幅4px・ダーク=アンバー / ライト=墨線）に準拠する", () => {
    expect(dark).toMatch(/::-webkit-scrollbar\s*\{\s*width:\s*4px/);
    expect(dark).toContain("rgba(232, 160, 18, 0.5)");
    expect(light).toMatch(/scrollbar-thumb\s*\{\s*background:\s*rgba\(31,30,28,0\.40\);\s*border-radius:\s*0/);
  });

  it("内側スクロール容器（コードブロック pre・図/数式プレビュー等）も外側と同じ 4px 幅に統一する", () => {
    // 旧実装は [data-am-content]（外側）だけに 4px を当て、.tiptap 配下の overflow:auto 容器
    // （CodeBlockBlockContent のプレビュー等）が OS 既定幅に戻り、箇所によりスクロールバー幅が
    // 不揃いになる回帰（2026-06-14 報告）。.tiptap 配下も同一指定で統一する。
    for (const css of [dark, light]) {
      expect(css).toMatch(/\.tiptap \*::-webkit-scrollbar\s*\{\s*width:\s*4px;\s*height:\s*4px/);
      expect(css).toMatch(/\.tiptap \*::-webkit-scrollbar-thumb\s*\{\s*background:/);
      expect(css).toMatch(/\[data-am-editor-root\] \.tiptap \*\s*\{[^}]*scrollbar-width:\s*thin/);
    }
  });

  it("admonition は絵文字様記号を使わず SVG マスクアイコン + テキストラベルで表現する", () => {
    // 旧 Unicode 記号（ⓘ ☘ ✉ ⚠ ⊙）を含まない
    for (const glyph of ["ⓘ", "☘", "✉", "⚠", "⊙"]) {
      expect(light).not.toContain(glyph);
    }
    expect(light).toContain("data:image/svg+xml");
    expect(light).toMatch(/admonition-type='note'\]::before\s*\{[^}]*mask:/);
    expect(light).toMatch(/admonition-type='note'\]::after\s*\{[^}]*content:\s*"Note"/);
  });

  it("ライトのインラインコードは水墨パレットの焦墨（#6B2A20）を用いる", () => {
    expect(light).toMatch(/\.tiptap code[^{]*\{[^}]*color:\s*#6B2A20/);
  });

  it("ダーク/ライトでテーマ依存色が切り替わる", () => {
    expect(light).not.toBe(dark);
    expect(light).toContain(DEFAULT_LIGHT_HEADING_LINK);
    expect(dark).toContain(DEFAULT_DARK_HEADING_LINK);
  });

  it("リンク hover ツールチップと検索マッチを定義する", () => {
    expect(light).toContain("content: attr(href)");
    expect(light).toContain(".search-match-current");
    expect(light).toContain(".comment-highlight");
  });

  it("imageRow（連続画像の横並び）を定義する", () => {
    expect(light).toContain("[data-image-row]");
    expect(light).toMatch(/\[data-image-row\][^{]*\{[^}]*display:\s*flex/);
  });
});

describe("injectEditorContentCss", () => {
  afterEach(() => {
    document.getElementById("am-editor-content-css")?.remove();
  });

  it("style 要素を 1 度だけ注入し、テーマ変更時は内容を差し替える", () => {
    injectEditorContentCss(false);
    const el = document.getElementById("am-editor-content-css") as HTMLStyleElement;
    expect(el).toBeTruthy();
    const lightCss = el.textContent;

    // 同一テーマの再注入は no-op（要素は増えない）
    injectEditorContentCss(false);
    expect(document.querySelectorAll("#am-editor-content-css")).toHaveLength(1);
    expect(el.textContent).toBe(lightCss);

    // テーマ変更で差し替え
    injectEditorContentCss(true);
    expect(document.querySelectorAll("#am-editor-content-css")).toHaveLength(1);
    expect(el.textContent).not.toBe(lightCss);
  });
});
