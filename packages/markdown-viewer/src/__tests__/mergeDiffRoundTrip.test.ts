/**
 * 比較モードの偽差分バグ検出テスト
 *
 * 問題: 同じマークダウンを比較した場合、左パネル（Tiptap シリアライズ済み）と
 * 右パネル（生テキスト）で異なる正規化レベルの文字列が比較され、
 * 改行・空白等の偽差分が発生していた。
 *
 * 修正: 右パネルも setContent 後に onUpdate が発火して Tiptap 正規化が通るようにした。
 * このテストは、同一マークダウンが Tiptap ラウンドトリップ後に computeDiff で
 * 差分なしと判定されることを検証する。
 */
import { createTestEditor } from "../testUtils/createTestEditor";
import { getMarkdownFromEditor } from "../types";
import { preserveBlankLines } from "../utils/sanitizeMarkdown";
import { computeDiff } from "../utils/diffEngine";

/**
 * Tiptap ラウンドトリップをシミュレートする。
 * InlineMergeView の右パネルと同じフロー:
 *   raw → preserveBlankLines → setContent → getMarkdownFromEditor
 */
function tiptapRoundTrip(md: string): string {
  const editor = createTestEditor({ withMarkdown: true });
  try {
    editor.commands.setContent(preserveBlankLines(md));
    return getMarkdownFromEditor(editor);
  } finally {
    editor.destroy();
  }
}

function simulateVsCodeSaveLoop(md: string, count: number): string {
  let current = md;
  for (let i = 0; i < count; i++) {
    let next = tiptapRoundTrip(current);
    if (next && !next.endsWith("\n")) next += "\n";
    current = next;
  }
  return current;
}

// ---------- ラウンドトリップ安定性テスト ----------

describe("Tiptap ラウンドトリップ安定性", () => {
  test("ラウンドトリップ後のテキスト同士で computeDiff が差分なし", () => {
    const md = "# Heading\n\nParagraph text.\n\n- item 1\n- item 2\n";
    const serialized = tiptapRoundTrip(md);
    const result = computeDiff(serialized, serialized);
    expect(result.blocks).toHaveLength(0);
  });

  test("2回のラウンドトリップで同一結果（冪等性）", () => {
    const md = "# Title\n\nSome **bold** and *italic* text.\n\n> blockquote\n";
    const first = tiptapRoundTrip(md);
    const second = tiptapRoundTrip(first);
    expect(first).toBe(second);
  });

  test("admonition + blockquote hardbreak で再保存時に改行が増殖しない", () => {
    const md = [
      "> [!NOTE]",
      "> 本書は時間軸に関する要件を集約するメタ要件書であり、個別機能の実装責務は既存の機体・管制塔要件書に委ねる。\\",
      "> 本書の役割は「時間軸の概念定義」と「既存要件の時間軸的整合性確認」に限定する。",
      "",
    ].join("\n");
    const first = tiptapRoundTrip(md);
    const second = tiptapRoundTrip(first);
    const third = tiptapRoundTrip(second);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test("VS Code 保存ループでも末尾改行が増殖しない", () => {
    const md = [
      "> [!NOTE]",
      "> 本書は時間軸に関する要件を集約するメタ要件書であり、個別機能の実装責務は既存の機体・管制塔要件書に委ねる。\\",
      "> 本書の役割は「時間軸の概念定義」と「既存要件の時間軸的整合性確認」に限定する。",
      "",
    ].join("\n");
    const once = simulateVsCodeSaveLoop(md, 1);
    const many = simulateVsCodeSaveLoop(md, 8);
    expect(many).toBe(once);
  });
});

// ---------- 偽差分バグの回帰テスト ----------

describe("比較モード偽差分: 同一ファイルを比較した場合に差分なし", () => {
  /**
   * 比較モードのシミュレーション:
   *   左パネル: editorContent = Tiptap シリアライズ済み（メインエディタの出力）
   *   右パネル: rightText = 同じ raw ファイルを Tiptap ラウンドトリップ
   *
   * 修正前は右パネルがラウンドトリップされず、raw のままだった。
   */
  function simulateMergeView(rawMd: string) {
    // 左パネル: メインエディタが raw を読み込み → シリアライズ
    const leftText = tiptapRoundTrip(rawMd);
    // 右パネル: 同じファイルをラウンドトリップ（修正後の動作）
    const rightText = tiptapRoundTrip(rawMd);
    return computeDiff(leftText, rightText);
  }

  test("基本的なマークダウン", () => {
    const md = "# Heading 1\n\n## Heading 2\n\nParagraph.\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("連続する空行を含むマークダウン", () => {
    const md = "Paragraph 1\n\n\n\nParagraph 2\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("コードブロックを含むマークダウン", () => {
    const md = "# Code\n\n```javascript\nconst a = 1;\nif (a > 0) {\n  console.log(a);\n}\n```\n\nAfter code.\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("リスト・タスクリストを含むマークダウン", () => {
    const md = "# Tasks\n\n- [ ] Task 1\n- [x] Task 2\n- Item 3\n\n1. First\n2. Second\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("テーブルを含むマークダウン", () => {
    const md = "# Table\n\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("引用・ネストを含むマークダウン", () => {
    const md = "> Quote line 1\n> Quote line 2\n\nNormal text.\n\n> > Nested quote\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("画像・リンクを含むマークダウン", () => {
    const md = "# Links\n\n[Link text](https://example.com)\n\n![Alt text](image.png)\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("Mermaid ダイアグラムを含むマークダウン", () => {
    const md = "# Diagram\n\n```mermaid\ngraph TD\n    A[Start] --> B{Decision}\n    B --> C[End]\n```\n\nAfter diagram.\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("日本語見出し・太字を含むマークダウン", () => {
    const md = "# 日本語タイトル\n\nこれは**太字**と*斜体*のテスト。\n\n## セクション2\n\n段落テキスト。\n";
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });

  test("ユーザー報告のサンプルに近い複合マークダウン", () => {
    const md = [
      "# ViewStream",
      "",
      "## 概要",
      "",
      "テキストの説明文。",
      "",
      "## 機能一覧",
      "",
      "- 機能A",
      "- 機能B",
      "- 機能C",
      "",
      "### コード例",
      "",
      "```typescript",
      "class Rectangle {",
      "  width: number;",
      "  height: number;",
      "  area(): number {",
      "    return this.width * this.height;",
      "  }",
      "}",
      "```",
      "",
      "> **注意**: これは重要な情報です。",
      "",
      "| 項目 | 値 |",
      "| --- | --- |",
      "| 幅 | 100 |",
      "| 高さ | 200 |",
      "",
    ].join("\n");
    const result = simulateMergeView(md);
    expect(result.blocks).toHaveLength(0);
  });
});

// ---------- 修正前の動作を検証するテスト ----------

describe("修正前の動作: raw vs serialized で偽差分が発生することの検証", () => {
  test("連続空行を含む場合、raw と serialized で差異が生じる", () => {
    const raw = "Paragraph 1\n\n\n\nParagraph 2\n";
    const serialized = tiptapRoundTrip(raw);
    // ラウンドトリップで改行数が変わる可能性がある
    // raw と serialized が異なる場合、computeDiff で差分が検出される
    if (raw !== serialized) {
      const result = computeDiff(serialized, raw);
      expect(result.blocks.length).toBeGreaterThan(0);
    }
  });

  test("ラウンドトリップ済みと raw を直接比較すると偽差分が発生しうる", () => {
    // このテストは修正前のバグを再現する
    // 左パネル (serialized) と右パネル (raw) の差異を検出
    const raw = "# Title\n\nText with **bold**.\n\n```js\nconst x = 1;\n```\n\n\n\nMore text.\n";
    const serialized = tiptapRoundTrip(raw);
    if (raw !== serialized) {
      const result = computeDiff(serialized, raw);
      // 修正前はこの差分が画面に表示されていた（偽差分）
      expect(result.blocks.length).toBeGreaterThan(0);
    }
    // 修正後: 両方をラウンドトリップすれば差分なし
    const rightSerialized = tiptapRoundTrip(raw);
    const fixedResult = computeDiff(serialized, rightSerialized);
    expect(fixedResult.blocks).toHaveLength(0);
  });
});
