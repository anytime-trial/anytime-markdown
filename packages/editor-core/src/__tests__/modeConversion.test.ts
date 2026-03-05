import { sanitizeMarkdown, preserveBlankLines, restoreBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { Editor } from "@tiptap/core";

// ---------- sanitizeMarkdown ----------

describe("sanitizeMarkdown", () => {
  test("コードブロック内のHTMLタグを保持する", () => {
    const md = "```html\n<div class=\"foo\">bar</div>\n```";
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test("コードブロック外の不許可HTMLタグを除去しテキストを保持する", () => {
    const md = "hello <script>alert(1)</script> world";
    const result = sanitizeMarkdown(md);
    expect(result).not.toContain("<script>");
    expect(result).toContain("hello");
    expect(result).toContain("world");
  });

  test("許可タグ（details, mark等）を保持する", () => {
    const md = "<details><summary>Title</summary>\n\ncontent\n\n</details>";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("<details>");
    expect(result).toContain("<summary>");
    expect(result).toContain("</details>");
  });

  test("コードブロック内の > < & 文字を保持する", () => {
    const md = "```js\nif (a > 0 && b < 1) { return a & b; }\n```";
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test("空行を含むコードブロックを正常に処理する", () => {
    const md = "```mermaid\ngraph TD\n\nA --> B\n\nB --> C\n```";
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test("複数のコードブロックを正常に処理する", () => {
    const md =
      "text before\n\n```js\nconst a = 1;\n```\n\nmiddle text\n\n```python\nprint('hello')\n```\n\ntext after";
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test("コードブロック前後の改行を保持する", () => {
    const md = "before\n\n```js\ncode\n```\n\nafter";
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  test("<mark>テキスト</mark> を保持する", () => {
    const result = sanitizeMarkdown("これは<mark>重要</mark>です");
    expect(result).toContain("<mark>重要</mark>");
  });

  test("<kbd>テキスト</kbd> を保持する", () => {
    const result = sanitizeMarkdown("<kbd>Ctrl+C</kbd>でコピー");
    expect(result).toContain("<kbd>Ctrl+C</kbd>");
  });

  test("<sub>テキスト</sub> を保持する", () => {
    const result = sanitizeMarkdown("H<sub>2</sub>O");
    expect(result).toContain("<sub>2</sub>");
  });

  test("<sup>テキスト</sup> を保持する", () => {
    const result = sanitizeMarkdown("x<sup>2</sup>+1");
    expect(result).toContain("<sup>2</sup>");
  });

  test("<u>テキスト</u> を保持する", () => {
    const result = sanitizeMarkdown("<u>下線テキスト</u>");
    expect(result).toContain("<u>下線テキスト</u>");
  });

  test("<br> を保持する", () => {
    const result = sanitizeMarkdown("行1<br>行2");
    expect(result).toContain("<br>");
  });

  test("<hr> を保持する", () => {
    const result = sanitizeMarkdown("上<hr>下");
    expect(result).toContain("<hr>");
  });

  test("不許可タグ（<div>, <span>）を除去しテキストを保持する", () => {
    const result = sanitizeMarkdown("<div>ブロック</div><span>インライン</span>");
    expect(result).not.toContain("<div>");
    expect(result).not.toContain("<span>");
    expect(result).toContain("ブロック");
    expect(result).toContain("インライン");
  });

  test("コメントハイライト span が保護・復元される", () => {
    const md = 'Hello <!-- comment-start:c1 -->world<!-- comment-end:c1 --> end.';
    const result = sanitizeMarkdown(md);
    expect(result).toContain('data-comment-id="c1"');
    expect(result).not.toContain("CMT");
  });

  test("コメントポイント span が保護・復元される", () => {
    const md = 'Hello <!-- comment-point:c2 --> end.';
    const result = sanitizeMarkdown(md);
    expect(result).toContain('data-comment-point="c2"');
    expect(result).not.toContain("CMTP");
  });

  test("マークダウン記法（> 引用, **太字**）をサニタイズで壊さない", () => {
    const md = "> 引用テキスト\n\n**太字テキスト**";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("> 引用テキスト");
    expect(result).toContain("**太字テキスト**");
  });

  // --- DOMPurify 改行消失防止のリグレッションテスト (323227e) ---

  test("テキスト前後の改行をDOMPurifyが除去しない", () => {
    const md = "\n\nsome <b>text</b>\n\n";
    const result = sanitizeMarkdown(md);
    expect(result).toMatch(/^\n\n/);
    expect(result).toMatch(/\n\n$/);
    expect(result).toContain("some text");
  });

  test("コードブロック間のテキスト部の改行を保持する", () => {
    const md = "```js\ncode1\n```\n\nparagraph\n\n```js\ncode2\n```";
    const result = sanitizeMarkdown(md);
    expect(result).toBe(md);
  });

  test("改行のみの部分はそのまま保持する", () => {
    const md = "aaa\n\n\n\nbbb";
    const result = sanitizeMarkdown(md);
    expect(result).toBe(md);
  });
});

// ---------- getMarkdownFromEditor — 改行数を変更しない ----------

describe("getMarkdownFromEditor — 改行数を変更しない", () => {
  function makeMockEditor(rawMd: string) {
    return {
      storage: {
        markdown: {
          getMarkdown: () => rawMd,
        },
      },
    } as unknown as Editor;
  }

  test("シリアライザ出力の改行数をそのまま保持する", () => {
    const raw = "![img](url)\n```js\ncode\n```";
    const result = getMarkdownFromEditor(makeMockEditor(raw));
    // 改行数を増減しない
    expect(result).toContain("![img](url)\n```js");
  });

  test("既に空行がある場合、そのまま保持する", () => {
    const raw = "![img](url)\n\n```js\ncode\n```";
    const result = getMarkdownFromEditor(makeMockEditor(raw));
    expect(result).toContain("![img](url)\n\n```js");
  });
});

// ---------- preserveBlankLines / restoreBlankLines ----------

describe("preserveBlankLines", () => {
  test("3つ以上の改行を ZWSP マーカー段落に変換する", () => {
    const input = "text1\n\n\n\ntext2";
    const result = preserveBlankLines(input);
    expect(result).toContain("\u200B");
    // 標準の段落区切り \n\n + ZWSP段落 2つ
    expect(result).toBe("text1\n\n\u200B\n\n\u200B\n\ntext2");
  });

  test("2つの改行（通常の段落区切り）はそのまま", () => {
    const input = "text1\n\ntext2";
    expect(preserveBlankLines(input)).toBe(input);
  });

  test("コードブロック内の連続改行は保持する", () => {
    const input = "text\n\n```\ncode\n\n\n\ncode\n```\n\ntext";
    const result = preserveBlankLines(input);
    expect(result).toContain("code\n\n\n\ncode");
  });

  test("通常の入力をそのまま返す（改行数を変更しない）", () => {
    const cases = [
      "テキスト\n\n- リスト",
      "- 項目A\n\n1. 項目B",
      "行1\n行2\n行3",
    ];
    for (const input of cases) {
      expect(preserveBlankLines(input)).toBe(input);
    }
  });

  test("リスト前後の tight transition に ZWNJ マーカーを付与する", () => {
    // 非リスト → リスト（空行なし）
    expect(preserveBlankLines("テキスト\n- リスト")).toBe("テキスト\u200C\n- リスト");
    // 見出し → リスト（空行なし）
    expect(preserveBlankLines("# 見出し\n- リスト")).toBe("# 見出し\u200C\n- リスト");
    // リスト → 非リスト（空行なし）
    expect(preserveBlankLines("- リスト\nテキスト")).toBe("- リスト\u200C\nテキスト");
    // 空行ありの場合はマーカーなし
    expect(preserveBlankLines("テキスト\n\n- リスト")).toBe("テキスト\n\n- リスト");
  });
});

describe("restoreBlankLines", () => {
  test("ZWSP マーカーを除去して空行を復元する", () => {
    const input = "text1\n\n\u200B\n\n\u200B\n\ntext2";
    expect(restoreBlankLines(input)).toBe("text1\n\n\n\ntext2");
  });

  test("ZWSP がなければそのまま返す", () => {
    const input = "text1\n\ntext2";
    expect(restoreBlankLines(input)).toBe(input);
  });
});
