import * as fs from "fs";
import * as path from "path";
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import { Editor } from "@tiptap/core";

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
    expect(result).toContain("const y = 2;");
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

  test("見出し + リスト（ProseMirror が \\n\\n に正規化する）", () => {
    const md = "### 構成\n\n- editor-core\n- web-app\n- vscode-extension";
    const result = roundTrip(md);
    // ProseMirror はブロック間を \n\n に正規化する
    expect(result).toMatch(/### 構成\n\n- editor-core/);
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

// ---------- 空行保持ラウンドトリップ ----------

describe("空行保持ラウンドトリップ", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  test("連続空行が保持される", () => {
    const md = "paragraph1\n\n\n\nparagraph2";
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(preserveBlankLines(md));
    const result = getMarkdownFromEditor(editor);
    expect(result).toBe("paragraph1\n\n\n\nparagraph2");
  });

  test("見出し間の連続空行が保持される", () => {
    const md = "# Heading1\n\n\n\n## Heading2";
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(preserveBlankLines(md));
    const result = getMarkdownFromEditor(editor);
    expect(result).toBe("# Heading1\n\n\n\n## Heading2");
  });
});

// ---------- テンプレートファイル ラウンドトリップ ----------

describe("テンプレートファイル ラウンドトリップ", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  const templatesDir = path.resolve(__dirname, "../../src/constants/templates");

  /** テンプレートを読み込み→保存して比較するヘルパー */
  function templateRoundTrip(filename: string, opts?: { withTable?: boolean }): string {
    const original = fs.readFileSync(path.join(templatesDir, filename), "utf-8");
    editor = createTestEditor({ withMarkdown: true, withTable: opts?.withTable });
    const preprocessed = preserveBlankLines(sanitizeMarkdown(original));
    editor.commands.setContent(preprocessed);
    return getMarkdownFromEditor(editor);
  }

  test("defaultContent.md: 読み込み→保存で内容が変わらない", () => {
    const original = fs.readFileSync(path.join(templatesDir, "defaultContent.md"), "utf-8");
    const saved = templateRoundTrip("defaultContent.md", { withTable: true });
    expect(saved).toBe(original.trimEnd());
  });

  test("welcomeContent.md: 読み込み→保存で内容が変わらない", () => {
    const original = fs.readFileSync(path.join(templatesDir, "welcomeContent.md"), "utf-8");
    const saved = templateRoundTrip("welcomeContent.md");
    expect(saved).toBe(original.trimEnd());
  });

  test("blogPost.md: 読み込み→保存で内容が変わらない", () => {
    const original = fs.readFileSync(path.join(templatesDir, "blogPost.md"), "utf-8");
    const saved = templateRoundTrip("blogPost.md");
    expect(saved).toBe(original.trimEnd());
  });

  test("meetingNotes.md: 読み込み→保存で内容が変わらない", () => {
    const original = fs.readFileSync(path.join(templatesDir, "meetingNotes.md"), "utf-8");
    const saved = templateRoundTrip("meetingNotes.md");
    expect(saved).toBe(original.trimEnd());
  });

  test("readme.md: 読み込み→保存で内容が変わらない", () => {
    const original = fs.readFileSync(path.join(templatesDir, "readme.md"), "utf-8");
    const saved = templateRoundTrip("readme.md", { withTable: true });
    expect(saved).toBe(original.trimEnd());
  });
});

// ---------- エッジケース ラウンドトリップ ----------

describe("エッジケース ラウンドトリップ", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  /** preserveBlankLines + sanitizeMarkdown → editor → getMarkdownFromEditor */
  function fullRoundTrip(md: string, opts?: { withTable?: boolean }): string {
    editor = createTestEditor({ withMarkdown: true, withTable: opts?.withTable });
    const preprocessed = preserveBlankLines(sanitizeMarkdown(md));
    editor.commands.setContent(preprocessed);
    return getMarkdownFromEditor(editor);
  }

  test("見出し + 段落 + コードブロックの組み合わせ", () => {
    // コードブロック末尾の空行はシリアライザが除去する
    const md = "## セクション\n\n説明文。\n\n```js\nconst x = 1;\n```";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("連続空行を挟む見出し群", () => {
    const md = "# 見出し1\n\n\n## 見出し2\n\n\n### 見出し3";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("箇条書きリスト + 番号付きリスト連続", () => {
    const md = "- A\n- B\n- C\n\n1. 一\n2. 二\n3. 三";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("タスクリスト（未完了 + 完了の混在）", () => {
    // tiptap はタスクリスト項目間に空行を挿入する
    const md = "- [ ] 未完了\n\n- [x] 完了\n\n- [ ] もう一つ";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("タスクリスト（空行なし）が空行なしで保持される", () => {
    const md = "- [x] エディタの基本操作を覚える\n- [x] ダイアグラムを試す\n- [ ] 自分のドキュメントを書いてみる";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("見出し直後のリスト（空行なし）が保持される", () => {
    const md = "### 構成\n- editor-core\n- web-app\n- vscode-extension";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("見出し + 空行 + リスト（空行が保持される）", () => {
    const md = "### 構成\n\n- editor-core\n- web-app\n- vscode-extension";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("見出し直後の番号付きリスト（空行なし）が保持される", () => {
    const md = "## 手順\n1. ファイルを開く\n2. 編集する\n3. 保存する";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("段落直後のリスト（空行なし）が保持される", () => {
    const md = "**改善内容:**\n1. xs/sm ブレークポイントでボタンを分離\n2. テスト追加";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("段落 + 空行 + リスト（空行が保持される）", () => {
    const md = "改善内容:\n\n- 項目A\n- 項目B";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("通常リスト（空行なし）が空行なしで保持される", () => {
    const md = "- 項目A\n- 項目B\n- 項目C";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("連続する段落行は ProseMirror がスペース結合する", () => {
    const md = "**A11y レビュー**: 該当なし\n**Designer レビュー**: 該当なし";
    const result = fullRoundTrip(md);
    // CommonMark ソフトブレーク: \n はスペースに変換される
    expect(result).toContain("A11y");
    expect(result).toContain("Designer");
  });

  test("ネストされた番号付きリストが空行なしで保持される", () => {
    const md = "1. ファイルを開く\n   1. ツールバーの「開く」をクリック\n   2. `.md` ファイルを選択\n2. 編集する\n3. 保存する";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("insertContent でネストされたリストが空行なしで保持される", () => {
    const template = "1. ファイルを開く\n   1. ツールバーの「開く」をクリック\n   2. `.md` ファイルを選択\n2. 編集する\n3. 保存する";

    // setContent: ドキュメント構造と markdown 出力を取得（参照）
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("# テスト\n\n" + template);
    const setDoc = JSON.stringify(editor.state.doc.toJSON(), null, 2);
    const setMd = getMarkdownFromEditor(editor);
    editor.destroy();

    // insertContent: ドキュメント構造と markdown 出力を取得
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("# テスト");
    editor.chain().focus().insertContent(template).run();
    const insertDoc = JSON.stringify(editor.state.doc.toJSON(), null, 2);
    const insertMd = getMarkdownFromEditor(editor);

    // ドキュメント構造が一致（末尾 \n が除去されている）
    expect(insertDoc).toBe(setDoc);
    // markdown 出力も一致
    expect(insertMd).toBe(setMd);
  });

  test("ネストされた引用", () => {
    const md = "> 外側\n>\n> > 内側";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("太字 + 斜体 + 打ち消し線を含む段落", () => {
    const md = "これは**太字**と*斜体*と~~取消~~を含むテキスト";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("画像の後にテーブル", () => {
    // image シリアライザが closeBlock() を呼ばないため空行が消失する
    const md = "![alt](image.png)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("![alt](image.png)");
    expect(result).toContain("| A | B |");
    expect(result).toContain("| 1 | 2 |");
  });

  test("コードブロック → 段落 → コードブロック", () => {
    const md =
      "```python\nprint('hello')\n```\n\n中間テキスト\n\n```bash\necho hi\n```";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("水平線で区切られたセクション", () => {
    const md = "セクション1\n\n---\n\nセクション2\n\n---\n\nセクション3";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("リンク + インラインコードを含むリスト", () => {
    const md = "- [リンク](https://example.com)\n- `コード`\n- **太字項目**";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("5つの連続空行が保持される", () => {
    const md = "段落A\n\n\n\n\n\n段落B";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("mermaid + plantuml 連続コードブロック", () => {
    const md =
      "```mermaid\ngraph TD\n    A --> B\n```\n\n```plantuml\nA -> B\n```";
    expect(fullRoundTrip(md)).toBe(md);
  });

  // ---------- ProseMirror 正規化の確認 ----------

  test("段落 → リスト → 段落の混在（ProseMirror 正規化）", () => {
    // ProseMirror はブロック間を \n\n に正規化する
    const md = "**レビュー結果:**\n1. 問題なし\n2. 修正済み\n\n**結論:**\n承認";
    const result = fullRoundTrip(md);
    expect(result).toContain("問題なし");
    expect(result).toContain("修正済み");
    expect(result).toContain("結論");
  });

  test("テーブルセル内の番号+ピリオドがエスケープされない", () => {
    const md = "| # | 手順 | 内容 |\n| --- | --- | --- |\n| 1. 入力サニタイズ | `func` | 説明 |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).not.toContain("1\\.");
    expect(result).toContain("1.");
  });
});
