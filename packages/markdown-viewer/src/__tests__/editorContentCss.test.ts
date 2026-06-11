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
    expect(light).toContain("var(--am-editor-line-height, 1.6)");
    expect(light).toContain("var(--am-editor-word-break, normal)");
    expect(light).toContain("var(--am-editor-bg");
    expect(light).toContain("var(--am-editor-text");
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
