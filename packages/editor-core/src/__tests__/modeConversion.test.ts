import { sanitizeMarkdown } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import type { Editor } from "@tiptap/core";

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

// ---------- getMarkdownFromEditor — コードフェンス前の空行補完 ----------

describe("getMarkdownFromEditor — コードフェンス前の空行補完", () => {
  function makeMockEditor(rawMd: string) {
    return {
      storage: {
        markdown: {
          getMarkdown: () => rawMd,
        },
      },
    } as unknown as Editor;
  }

  test("画像直後（改行なし）にコードフェンスがある場合、空行を補完する", () => {
    const raw = "![img](url)```js\ncode\n```";
    const result = getMarkdownFromEditor(makeMockEditor(raw));
    // 開きフェンスの前に空行が補完される
    expect(result).toContain("![img](url)\n\n```js");
  });

  test("画像直後（改行1個）にコードフェンスがある場合、空行を補完する", () => {
    const raw = "![img](url)\n```js\ncode\n```";
    const result = getMarkdownFromEditor(makeMockEditor(raw));
    // 改行1個が空行に補完される
    expect(result).toContain("![img](url)\n\n```js");
  });

  test("既に空行がある場合、開きフェンス前は変更しない", () => {
    const raw = "![img](url)\n\n```js\ncode\n```";
    const result = getMarkdownFromEditor(makeMockEditor(raw));
    // 開きフェンス前の空行はそのまま
    expect(result).toContain("![img](url)\n\n```js");
  });
});

// ---------- ラウンドトリップ: markdown → Editor → markdown ----------

describe("ラウンドトリップ: markdown → Editor → markdown", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  function roundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(md);
    return getMarkdownFromEditor(editor);
  }

  test("見出しとテキスト", () => {
    const md = "# Hello\n\nsome text";
    const result = roundTrip(md);
    expect(result).toContain("# Hello");
    expect(result).toContain("some text");
  });

  test("コードブロック（言語指定あり）", () => {
    const md = "```javascript\nconst x = 1;\n```";
    const result = roundTrip(md);
    expect(result).toContain("```javascript");
    expect(result).toContain("const x = 1;");
    expect(result.trim().endsWith("```")).toBe(true);
  });

  test("空行を含む mermaid コードブロック", () => {
    const md = "```mermaid\ngraph TD\n\nA --> B\n\nB --> C\n```";
    const result = roundTrip(md);
    expect(result).toContain("```mermaid");
    expect(result).toContain("graph TD");
    expect(result).toContain("A --> B");
    expect(result).toContain("B --> C");
  });

  test("複数のコードブロック（mermaid + plantuml）", () => {
    const md =
      "```mermaid\ngraph TD\nA --> B\n```\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```";
    const result = roundTrip(md);
    expect(result).toContain("```mermaid");
    expect(result).toContain("```plantuml");
    expect(result).toContain("@startuml");
  });

  test("画像 + コードブロック", () => {
    const md = "![alt](https://example.com/img.png)\n\n```js\nconst y = 2;\n```";
    const result = roundTrip(md);
    expect(result).toContain("![alt](https://example.com/img.png)");
    expect(result).toContain("```js");
    // 画像とコードブロックの間に空行があること
    const imgIdx = result.indexOf("![alt]");
    const fenceIdx = result.indexOf("```js");
    const between = result.slice(imgIdx, fenceIdx);
    expect(between).toContain("\n\n");
  });
});

// ---------- ラウンドトリップ: 見出し ----------

describe("ラウンドトリップ: 見出し", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  function roundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(md);
    return getMarkdownFromEditor(editor);
  }

  test.each([
    ["h1", "# 見出し1"],
    ["h2", "## 見出し2"],
    ["h3", "### 見出し3"],
    ["h4", "#### 見出し4"],
    ["h5", "##### 見出し5"],
  ])("%s レベルの見出し", (_label, md) => {
    const result = roundTrip(md);
    expect(result.trim()).toBe(md);
  });
});

// ---------- ラウンドトリップ: インライン装飾 ----------

describe("ラウンドトリップ: インライン装飾", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  function roundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(md);
    return getMarkdownFromEditor(editor);
  }

  test("太字（**text**）", () => {
    const result = roundTrip("**太字テキスト**");
    expect(result).toContain("**太字テキスト**");
  });

  test("イタリック（*text*）", () => {
    const result = roundTrip("*斜体テキスト*");
    expect(result).toContain("*斜体テキスト*");
  });

  test("打ち消し線（~~text~~）", () => {
    const result = roundTrip("~~取消線~~");
    expect(result).toContain("~~取消線~~");
  });

  test("インラインコード（`code`）", () => {
    const result = roundTrip("`inline code`");
    expect(result).toContain("`inline code`");
  });

  test("リンク（[text](url)）", () => {
    const result = roundTrip("[リンク](https://example.com)");
    expect(result).toContain("[リンク](https://example.com)");
  });

  test("ハイライト（==text==）", () => {
    const result = roundTrip("==ハイライト==");
    expect(result).toContain("==ハイライト==");
  });

  test("下線は HTML ベースのため toContain で検証", () => {
    // tiptap-markdown は下線を <u> タグとして出力する
    const result = roundTrip("<u>下線テキスト</u>");
    expect(result).toContain("下線テキスト");
  });
});

// ---------- ラウンドトリップ: ブロック要素 ----------

describe("ラウンドトリップ: ブロック要素", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  function roundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(md);
    return getMarkdownFromEditor(editor);
  }

  test("ブロック引用（> text）", () => {
    const result = roundTrip("> 引用テキスト");
    expect(result).toContain("> 引用テキスト");
  });

  test("箇条書きリスト（- item）", () => {
    const md = "- アイテム1\n- アイテム2\n- アイテム3";
    const result = roundTrip(md);
    expect(result).toContain("アイテム1");
    expect(result).toContain("アイテム2");
    expect(result).toContain("アイテム3");
  });

  test("番号付きリスト（1. item）", () => {
    const md = "1. 最初\n2. 次\n3. 最後";
    const result = roundTrip(md);
    expect(result).toContain("最初");
    expect(result).toContain("次");
    expect(result).toContain("最後");
    // 番号付きリストの記法が含まれること
    expect(result).toMatch(/\d+\.\s/);
  });

  test("ネストされたリスト", () => {
    const md = "- 親\n  - 子1\n  - 子2";
    const result = roundTrip(md);
    expect(result).toContain("親");
    expect(result).toContain("子1");
    expect(result).toContain("子2");
  });

  test("タスクリスト（- [ ] / - [x]）", () => {
    const md = "- [ ] 未完了タスク\n- [x] 完了タスク";
    const result = roundTrip(md);
    expect(result).toContain("未完了タスク");
    expect(result).toContain("完了タスク");
    // チェックボックス記法が含まれること
    expect(result).toContain("[ ]");
    expect(result).toContain("[x]");
  });

  test("水平線（---）", () => {
    const md = "上のテキスト\n\n---\n\n下のテキスト";
    const result = roundTrip(md);
    expect(result).toContain("上のテキスト");
    expect(result).toContain("下のテキスト");
    expect(result).toContain("---");
  });
});

// ---------- ラウンドトリップ: テーブル ----------

describe("ラウンドトリップ: テーブル", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  test("基本的なテーブル", () => {
    const md = "| 名前 | 年齢 |\n| --- | --- |\n| 太郎 | 25 |";
    editor = createTestEditor({ withMarkdown: true, withTable: true });
    editor.commands.setContent(md);
    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("名前");
    expect(result).toContain("年齢");
    expect(result).toContain("太郎");
    expect(result).toContain("25");
    // テーブル記法のパイプが含まれること
    expect(result).toContain("|");
  });
});

// ---------- ラウンドトリップ: 複合要素 ----------

describe("ラウンドトリップ: 複合要素", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  function roundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(md);
    return getMarkdownFromEditor(editor);
  }

  test("見出し + 段落 + リスト", () => {
    const md = "## タイトル\n\n説明文です。\n\n- 項目A\n- 項目B";
    const result = roundTrip(md);
    expect(result).toContain("## タイトル");
    expect(result).toContain("説明文です");
    expect(result).toContain("項目A");
    expect(result).toContain("項目B");
  });

  test("ブロック引用 + コードブロック", () => {
    const md = "> 引用文\n\n```js\nconsole.log('hello');\n```";
    const result = roundTrip(md);
    expect(result).toContain("> 引用文");
    expect(result).toContain("```js");
    expect(result).toContain("console.log('hello');");
  });

  test("画像 + テーブル", () => {
    const md =
      "![photo](https://example.com/photo.jpg)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    editor = createTestEditor({ withMarkdown: true, withTable: true });
    editor.commands.setContent(md);
    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("![photo](https://example.com/photo.jpg)");
    expect(result).toContain("|");
    expect(result).toContain("1");
    expect(result).toContain("2");
  });
});
