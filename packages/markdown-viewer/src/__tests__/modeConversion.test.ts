import { sanitizeMarkdown, preserveBlankLines, restoreBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { createTestEditor } from "../testUtils/createTestEditor";

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

  // --- blockquote 内バックスラッシュ改行のリグレッションテスト (d851da9) ---

  test("blockquote 内のバックスラッシュ改行で次行の > が欠落しない", () => {
    const md = "> **【A11y】** 1行目。\\\n> **【Designer】** 2行目。";
    const result = sanitizeMarkdown(md);
    // > が欠落して **** に化けないことを検証
    expect(result).not.toContain("****");
    expect(result).toContain("> ");
    expect(result).toContain("**【Designer】**");
  });

  test("blockquote 内の複数行バックスラッシュ改行を保持する", () => {
    const md = "> 1行目\\\n> 2行目\\\n> 3行目";
    const result = sanitizeMarkdown(md);
    const lines = result.split("\n").filter((l: string) => l.trim());
    // 全行が > で始まること
    for (const line of lines) {
      expect(line.startsWith(">")).toBe(true);
    }
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

  test("インラインコード内のHTMLタグがそのまま保持される", () => {
    const md = "- **HTML 安全性**: `<script>`, `<iframe>` 等の危険タグは除去される";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("`<script>`");
    expect(result).toContain("`<iframe>`");
  });

  test("複数のインラインコードのHTMLタグがそのまま保持される", () => {
    const md = "`<div>` と `<span>` はブロック要素とインライン要素";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("`<div>`");
    expect(result).toContain("`<span>`");
  });

  test("ダブルバッククォートのインラインコードのHTMLタグがそのまま保持される", () => {
    const md = "`` `<script>` `` はネストされたバッククォート";
    const result = sanitizeMarkdown(md);
    expect(result).toContain("`<script>`");
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
    ];
    for (const input of cases) {
      expect(preserveBlankLines(input)).toBe(input);
    }
  });

  test("連続プレーンテキスト行にハードブレイクを付加する", () => {
    expect(preserveBlankLines("行1\n行2\n行3")).toBe("行1\\\n行2\\\n行3");
  });

  test("既にハードブレイクがある行はそのまま保持する", () => {
    const input = "行1\\\n行2\\\n行3";
    expect(preserveBlankLines(input)).toBe(input);
  });

  test("タブ区切りデータには <br> を付加する", () => {
    const input = "列1\t列2\t列3\nデータ1\tデータ2\tデータ3";
    expect(preserveBlankLines(input)).toBe("列1\t列2\t列3<br>\nデータ1\tデータ2\tデータ3");
  });

  test("マークダウンテーブル行にはハードブレイクを付加しない", () => {
    const input = "| Header1 | Header2 |\n| --- | --- |\n| Cell1 | Cell2 |";
    expect(preserveBlankLines(input)).toBe(input);
  });

  test("バックスラッシュ改行（ハードブレイク）を tight transition と誤判定しない", () => {
    // リスト内のバックスラッシュ改行は同一ブロックの継続
    const input = "- テキスト。\\\n継続行1\\\n継続行2";
    expect(preserveBlankLines(input)).toBe(input);
  });

  test("テーブルセル内のバックスラッシュ改行を <br> に変換する", () => {
    const input = "| col1 | col2 |\n| --- | --- |\n| テスト。\\\n継続行 | 値 |";
    const result = preserveBlankLines(input);
    // \+改行 が <br> に変換されること
    expect(result).toContain("テスト。<br>継続行");
    // テーブル行が分割されないこと
    const rows = result.split("\n").filter((l: string) => l.startsWith("|"));
    expect(rows).toHaveLength(3); // ヘッダー + 区切り + データ行
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

// ---------- ラウンドトリップ: blockquote 内バックスラッシュ改行 (d851da9) ----------

describe("blockquote ラウンドトリップ", () => {
  function roundtrip(md: string): string {
    const editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: md,
    });
    const output = getMarkdownFromEditor(editor);
    editor.destroy();
    return output;
  }

  test("blockquote 内のバックスラッシュ改行で > が欠落し **** に化けない", () => {
    const md = "> **【A11y】** 1行目。\\\n> **【Designer】** 2行目。";
    const output = roundtrip(md);
    // **** に化けないこと
    expect(output).not.toContain("****");
    // 太字マーカーが保持されること
    expect(output).toContain("**【A11y】**");
    expect(output).toContain("**【Designer】**");
  });

  test("blockquote 内の複数行がラウンドトリップで blockquote を維持する", () => {
    const md = "> 1行目\\\n> 2行目\\\n> 3行目";
    const output = roundtrip(md);
    const lines = output.split("\n").filter((l: string) => l.trim());
    // 少なくとも1行が > で始まること（blockquote が消えないこと）
    expect(lines.some((l: string) => l.startsWith(">"))).toBe(true);
  });

  test("blockquote 内の空行（段落区切り）がラウンドトリップで保持される", () => {
    const md = "> 1段落目\n>\n> 2段落目";
    const output = roundtrip(md);
    // 2段落目が blockquote 内に残ること
    expect(output).toContain("> 2段落目");
    // 空行区切りが保持されること（> のみの行、または空行 + > ）
    const lines = output.split("\n");
    const idx1 = lines.findIndex((l: string) => l.includes("1段落目"));
    const idx2 = lines.findIndex((l: string) => l.includes("2段落目"));
    // 2段落目が1段落目の直後ではないこと（間に空行がある）
    expect(idx2 - idx1).toBeGreaterThan(1);
  });

  test("blockquote 内の空行が sanitizeMarkdown で保持される", () => {
    const md = "> A11y: テスト行。\n>\n> **推奨案**: 推奨テキスト。";
    const result = sanitizeMarkdown(md);
    expect(result).toContain(">");
    // > のみの行（空行区切り）が残ること
    const lines = result.split("\n");
    expect(lines.some((l: string) => l.trim() === ">")).toBe(true);
  });

  test("blockquote 内の空行が preserveBlankLines で保持される", () => {
    const md = "> A11y: テスト行。\n>\n> **推奨案**: 推奨テキスト。";
    const result = preserveBlankLines(md);
    const lines = result.split("\n");
    expect(lines.some((l: string) => l.trim() === ">")).toBe(true);
  });

  test("blockquote 内の空行が sanitizeMarkdown + ラウンドトリップで保持される", () => {
    const md = "> A11y: テスト行。\n>\n> **推奨案**: 推奨テキスト。";
    const afterSanitize = sanitizeMarkdown(md);
    const afterPreserve = preserveBlankLines(afterSanitize);
    const editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: afterPreserve,
    });
    const output = getMarkdownFromEditor(editor);
    editor.destroy();
    // **** に化けないこと
    expect(output).not.toContain("****");
    // 推奨案の太字が保持されること
    expect(output).toContain("**推奨案**");
    // blockquote 内の空行区切りが保持されること
    expect(output).toContain(">\n>");
  });

  test("blockquote 内の bold 段落間の空行がフルパイプラインで保持される", () => {
    const md = "> **【Engineer 注記】** コメント1\n>\n> **【Designer 質問】** コメント2";
    const afterSanitize = sanitizeMarkdown(md);
    const afterPreserve = preserveBlankLines(afterSanitize);
    const editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: afterPreserve,
    });
    const output = getMarkdownFromEditor(editor);
    editor.destroy();
    // **** に化けないこと
    expect(output).not.toContain("****");
    // 両方の太字が保持されること
    expect(output).toContain("**【Engineer 注記】**");
    expect(output).toContain("**【Designer 質問】**");
    // blockquote 内の空行区切りが保持されること
    expect(output).toContain(">\n>");
  });

  test("リスト内のバックスラッシュ改行がラウンドトリップで保持される", () => {
    const md = "- **A11y**: テスト確認済み。\\\n色のみ依存は解消。\\\n代替テキスト不備は解消。";
    const afterSanitize = sanitizeMarkdown(md);
    const afterPreserve = preserveBlankLines(afterSanitize);
    const editor = new Editor({
      extensions: [StarterKit, Markdown.configure({ html: true })],
      content: afterPreserve,
    });
    const output = getMarkdownFromEditor(editor);
    editor.destroy();
    // バックスラッシュがエスケープされて \\\\ にならないこと
    expect(output).not.toContain("\\\\");
    // ハードブレイクが保持されること
    expect(output).toContain("\\\n");
    // 太字が保持されること
    expect(output).toContain("**A11y**");
    // 継続行に不要な2スペースインデントが追加されないこと
    expect(output).not.toMatch(/\\\n {2}[^ ]/);
  });

  test("テーブルセル内のバックスラッシュ改行がラウンドトリップで行分割されない", () => {
    const md = "| col1 | col2 | col3 |\n| --- | --- | --- |\n| KeyboardSensor 未検証 | 低 | 実機テストで確認。\\\n問題があれば代替 UI を追加 |";
    const afterSanitize = sanitizeMarkdown(md);
    const afterPreserve = preserveBlankLines(afterSanitize);
    const editor = createTestEditor({ content: afterPreserve, withTable: true, withMarkdown: true });
    const output = getMarkdownFromEditor(editor);
    editor.destroy();
    // テーブルが2行に分割されないこと（ヘッダー + 区切り + データ1行 = 3行）
    const rows = output.trim().split("\n").filter((l: string) => l.startsWith("|"));
    expect(rows).toHaveLength(3);
    // セル内の改行コンテンツが保持されること
    expect(output).toContain("実機テストで確認。");
    expect(output).toContain("問題があれば代替 UI を追加");
  });
});
