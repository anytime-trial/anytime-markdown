/**
 * markdown-engine sanitizeMarkdown のユニットテスト。
 * レビュー指摘 29（markdown-engine にユニットテストが皆無）対応。
 * markdown-engine 自体は test スクリプトを持たないため、markdown-viewer の
 * jest 基盤（moduleNameMapper で @anytime-markdown/markdown-engine → 実ソース）に載せる。
 */
import { sanitizeMarkdown } from "@anytime-markdown/markdown-engine";

describe("sanitizeMarkdown - 許可タグの通過", () => {
  test.each(["br", "hr", "sub", "sup", "mark", "kbd", "u"])("<%s> タグは通過する", (tag) => {
    const md = `text <${tag}>content</${tag}> text`;
    expect(sanitizeMarkdown(md)).toContain(`<${tag}>`);
  });

  test("見出し・リンク・テーブル・画像のプレーン Markdown 記法はサニタイズ対象外でそのまま通過する", () => {
    const md = [
      "# Heading",
      "",
      "[link](https://example.com)",
      "",
      "![alt](https://example.com/a.png)",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");
    const result = sanitizeMarkdown(md);
    expect(result).toContain("# Heading");
    expect(result).toContain("[link](https://example.com)");
    expect(result).toContain("![alt](https://example.com/a.png)");
    expect(result).toContain("| a | b |");
  });
});

describe("sanitizeMarkdown - 許可タグでも属性は除去される（ALLOWED_ATTR: []）", () => {
  test("<mark class=\"x\"> の属性は除去されタグ自体は残る", () => {
    const md = 'text <mark class="x">hl</mark> text';
    const result = sanitizeMarkdown(md);
    expect(result).toContain("<mark>hl</mark>");
    expect(result).not.toContain("class=");
  });
});

describe("sanitizeMarkdown - 危険タグ・属性の除去境界値", () => {
  test("<script> タグは除去される（KEEP_CONTENT によりテキストは残存し得る）", () => {
    const md = 'before <script>alert(1)</script> after';
    const result = sanitizeMarkdown(md);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("</script>");
  });

  test("onerror 属性を持つ img タグは除去される", () => {
    const md = 'before <img src="x" onerror="alert(1)"> after';
    const result = sanitizeMarkdown(md);
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
  });

  test("javascript: href を持つ a タグは除去される", () => {
    const md = 'before <a href="javascript:alert(1)">click</a> after';
    const result = sanitizeMarkdown(md);
    expect(result).not.toContain("<a ");
    expect(result).not.toContain("javascript:");
  });

  test("<iframe> タグは除去される", () => {
    const md = 'before <iframe src="javascript:alert(1)"></iframe> after';
    const result = sanitizeMarkdown(md);
    expect(result).not.toContain("<iframe");
  });

  test("<svg><script> のようなネストした危険タグも除去される", () => {
    const md = "before <svg><script>alert(1)</script></svg> after";
    const result = sanitizeMarkdown(md);
    expect(result).not.toContain("<svg");
    expect(result).not.toContain("<script");
  });
});

describe("sanitizeMarkdown - コードブロック内はサニタイズ対象外", () => {
  test("コードフェンス内の <script> はそのまま保持される", () => {
    const md = ["```html", "<script>alert(1)</script>", "```"].join("\n");
    const result = sanitizeMarkdown(md);
    expect(result).toContain("<script>alert(1)</script>");
  });

  test("コードブロック外の同内容は除去される（前後比較）", () => {
    const inCode = sanitizeMarkdown(["```html", "<script>x</script>", "```"].join("\n"));
    const outOfCode = sanitizeMarkdown("<script>x</script>");
    expect(inCode).toContain("<script>x</script>");
    expect(outOfCode).not.toContain("<script");
  });
});

describe("sanitizeMarkdown - Purifier 未設定時のフォールバック挙動（素通し設計）", () => {
  // resolvePurifier() は typeof window !== "undefined" で判定するため、
  // このテストファイルの既定 testEnvironment (jsdom) では window が定義されており
  // 通常経路（DOMPurify 適用）を通る。フォールバック（purifier=null）分岐は
  // window 自体が存在しない環境（例: Node 単体）でのみ到達するため、
  // 同一ファイル内では再現できず別ファイル（node 環境）で検証する。
  test("jsdom 環境では window が定義されており通常のサニタイズが適用される", () => {
    expect(typeof window).not.toBe("undefined");
    const result = sanitizeMarkdown("<script>alert(1)</script>");
    expect(result).not.toContain("<script");
  });
});

describe("sanitizeMarkdown - 空入力・境界値", () => {
  test("空文字列", () => {
    expect(sanitizeMarkdown("")).toBe("");
  });

  test("HTML を含まないプレーンテキスト", () => {
    expect(sanitizeMarkdown("plain text")).toBe("plain text");
  });
});
