/**
 * markdownPreview.ts — `markdown` フェンスの本文を HTML 化するプレビュー変換のテスト。
 * markdown-it / DOMPurify はいずれも実物を使う（サニタイズの実効性を検証するため）。
 */

import { renderMarkdownPreviewHtml } from "../utils/markdownPreview";

/** サニタイズ結果を DOM として検証するためのパーサ（文字列一致では素通りするため）。 */
function parse(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("renderMarkdownPreviewHtml", () => {
  it("空文字は空文字を返す", () => {
    expect(renderMarkdownPreviewHtml("")).toBe("");
  });

  it("見出しをタグ化する", () => {
    const html = renderMarkdownPreviewHtml("# Issue 解決レポート");
    expect(html).toContain("<h1>Issue 解決レポート</h1>");
  });

  it("リストをタグ化する", () => {
    const html = renderMarkdownPreviewHtml("- 対象: X 件\n- 解決: X 件");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>対象: X 件</li>");
  });

  it("テーブルをタグ化する", () => {
    const html = renderMarkdownPreviewHtml("| ソース | ID |\n| --- | --- |\n| a | 1 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>ソース</th>");
    expect(html).toContain("<td>a</td>");
  });

  it("入れ子のフェンスをコードブロックとして描画する", () => {
    const html = renderMarkdownPreviewHtml("```ts\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("const x = 1;");
    // フェンス内はレンダリングせずリテラル表示（再帰プレビューにしない）
    expect(html).not.toContain("<h1>");
  });

  it("生 HTML はレンダリングせずエスケープする", () => {
    const html = renderMarkdownPreviewHtml("<div>raw</div>\n\n<b>bold</b>");
    expect(html).not.toContain("<div>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;div&gt;");
  });

  it("script を出力しない", () => {
    const html = renderMarkdownPreviewHtml("<script>bad()</script>");
    expect(html).not.toContain("<script");
  });

  it("イベントハンドラ属性つきの要素を生成しない", () => {
    // 生 HTML はエスケープされるため、文字列としては残るが要素にはならない。
    const root = parse(renderMarkdownPreviewHtml('<img src="x" onerror="bad()">'));
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("[onerror]")).toBeNull();
  });

  it("javascript: スキームのリンクを生成しない", () => {
    const root = parse(renderMarkdownPreviewHtml("[click](javascript:bad())"));
    expect(root.querySelector("a")).toBeNull();
  });

  it("裸の URL をリンク化する", () => {
    const html = renderMarkdownPreviewHtml("https://example.com/a");
    expect(html).toContain('href="https://example.com/a"');
  });
});
