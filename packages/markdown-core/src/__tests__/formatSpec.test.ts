/**
 * Claude Code Markdown フォーマット仕様 準拠テスト
 * docs/spec/claude-code-markdown-format-spec.md の各セクションに対応
 */
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import { Editor } from "@tiptap/core";

/** フルラウンドトリップ: sanitize → preserve → Editor → getMarkdown */
function fullRoundTrip(md: string, opts?: { withTable?: boolean }): string {
  const editor = createTestEditor({ withMarkdown: true, withTable: opts?.withTable });
  const preprocessed = preserveBlankLines(sanitizeMarkdown(md));
  editor.commands.setContent(preprocessed);
  const result = getMarkdownFromEditor(editor);
  editor.destroy();
  return result;
}

// ==========================================================================
// 1. ATX 見出し (Section 4.2)
// ==========================================================================
describe("仕様1: ATX 見出し", () => {
  test.each([
    ["h1", "# 見出し1"],
    ["h2", "## 見出し2"],
    ["h3", "### 見出し3"],
    ["h4", "#### 見出し4"],
    ["h5", "##### 見出し5"],
  ])("%s が # 記法で出力される", (_label, md) => {
    const result = fullRoundTrip(md);
    expect(result.trim()).toBe(md);
  });

  test("見出しの後にテキストが続く場合", () => {
    const md = "# タイトル\n\n本文テキスト";
    expect(fullRoundTrip(md)).toBe(md);
  });
});

// ==========================================================================
// 2. 水平線 (Section 4.1)
// ==========================================================================
describe("仕様2: 水平線", () => {
  test("--- で出力される", () => {
    const md = "上\n\n---\n\n下";
    const result = fullRoundTrip(md);
    expect(result).toContain("---");
  });

  test("水平線で区切られた複数セクション", () => {
    const md = "セクション1\n\n---\n\nセクション2\n\n---\n\nセクション3";
    expect(fullRoundTrip(md)).toBe(md);
  });
});

// ==========================================================================
// 3. フェンスコードブロック (Section 4.5)
// ==========================================================================
describe("仕様3: フェンスコードブロック", () => {
  test("バッククォート3個で囲まれる", () => {
    const md = "```\ncode\n```";
    const result = fullRoundTrip(md);
    expect(result).toContain("```");
    expect(result).toContain("code");
  });

  test("言語指定（インフォ文字列）が保持される", () => {
    const md = "```javascript\nconst x = 1;\n```";
    const result = fullRoundTrip(md);
    expect(result).toContain("```javascript");
    expect(result).toContain("const x = 1;");
  });

  test("コードブロック内のHTMLタグが保持される", () => {
    const md = '```html\n<div class="foo">bar</div>\n```';
    const result = fullRoundTrip(md);
    expect(result).toContain('<div class="foo">bar</div>');
  });

  test("コードブロック内の特殊文字が保持される", () => {
    const md = "```js\nif (a > 0 && b < 1) {}\n```";
    const result = fullRoundTrip(md);
    expect(result).toContain("if (a > 0 && b < 1) {}");
  });

  test("空行を含むコードブロック", () => {
    const md = "```mermaid\ngraph TD\n\nA --> B\n```";
    const result = fullRoundTrip(md);
    expect(result).toContain("graph TD");
    expect(result).toContain("A --> B");
  });
});

// ==========================================================================
// 4. テーブル (GFM 拡張, Section 4.10)
// ==========================================================================
describe("仕様4: テーブル", () => {
  test("基本的なテーブルが | --- | セパレータで出力される", () => {
    const md = "| H1 | H2 |\n| --- | --- |\n| D1 | D2 |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("| H1 | H2 |");
    expect(result).toMatch(/\| ---/);
    expect(result).toContain("| D1 | D2 |");
  });

  test("セパレータ行が | --- | に正規化される", () => {
    const md = "| H1 | H2 |\n|---|---|\n| D1 | D2 |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("| --- | --- |");
  });

  test("テーブルセル内のバックスラッシュエスケープが除去される", () => {
    const md = "| 手順 |\n| --- |\n| 1. 入力 |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).not.toContain("1\\.");
    expect(result).toContain("1.");
  });

  test("テーブルセル内の &gt; &lt; がデコードされる", () => {
    const md = "| 比較 |\n| --- |\n| a > b |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).not.toContain("&gt;");
    expect(result).toContain("a > b");
  });

  test("空セルの余分なスペースが正規化される", () => {
    const md = "| A | B |\n| --- | --- |\n| x | |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("| x | |");
  });

  test("コードスパン内のパイプがセル区切りと誤認されない", () => {
    const md = "| A | B |\n| --- | --- |\n| `| --- |` 形式 | テスト |";
    const result = fullRoundTrip(md, { withTable: true });
    // テーブルパーサーが \| の \ を消費するため、出力は \| にエスケープされる
    // 表示上は同じ | --- | として表示される
    expect(result).toContain("`\\| --- \\|`");
    expect(result).toContain("| テスト |");
  });

  test("コードスパン内の脚注 [^id] が変換されない", () => {
    const md = "| A | B |\n| --- | --- |\n| `[^1]` | テスト |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("`[^1]`");
    expect(result).not.toContain("data-footnote-ref");
  });
});

// ==========================================================================
// 5. コードスパン (Section 6.3)
// ==========================================================================
describe("仕様5: コードスパン", () => {
  test("バッククォート1個で囲まれる", () => {
    const md = "テキスト `code` テキスト";
    const result = fullRoundTrip(md);
    expect(result).toContain("`code`");
  });

  test("コードスパン内のバックスラッシュはリテラル", () => {
    const md = "`foo\\bar`";
    const result = fullRoundTrip(md);
    expect(result).toContain("`foo\\bar`");
  });

  test("テーブル内のコードスパンのバッククォートが最小化される", () => {
    // 内容に ``` があるが単独の ` はない → 1個で十分
    const md = "| コード |\n| --- |\n| ` ```html ` |";
    const result = fullRoundTrip(md, { withTable: true });
    // バッククォートが不必要に増加していないこと
    expect(result).not.toContain("````");
  });

  test("コードスパン内の [^id] が脚注に変換されない", () => {
    const md = "`[^1]` はテスト";
    const result = fullRoundTrip(md);
    expect(result).toContain("`[^1]`");
    expect(result).not.toContain("data-footnote-ref");
  });
});

// ==========================================================================
// 6. リスト (Section 5.2-5.4)
// ==========================================================================
describe("仕様6: リスト", () => {
  test("箇条書きリストが - で出力される", () => {
    const md = "- 項目1\n- 項目2\n- 項目3";
    const result = fullRoundTrip(md);
    expect(result).toBe(md);
  });

  test("順序付きリストが 数字. で出力される", () => {
    const md = "1. 項目1\n2. 項目2\n3. 項目3";
    const result = fullRoundTrip(md);
    expect(result).toMatch(/1\. 項目1/);
    expect(result).toMatch(/2\. 項目2/);
    expect(result).toMatch(/3\. 項目3/);
  });

  test("ネストしたリスト", () => {
    const md = "- 親\n    - 子1\n    - 子2";
    const result = fullRoundTrip(md);
    expect(result).toContain("親");
    expect(result).toContain("子1");
    expect(result).toContain("子2");
  });

  test("密なリスト（空行なし）が保持される", () => {
    const md = "- A\n- B\n- C";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("緩いリスト（空行あり）が保持される", () => {
    const md = "- A\n\n- B\n\n- C";
    expect(fullRoundTrip(md)).toBe(md);
  });
});

// ==========================================================================
// 7. タスクリスト (GFM 拡張, Section 5.3)
// ==========================================================================
describe("仕様7: タスクリスト", () => {
  test("未完了 [ ] と完了 [x] が出力される", () => {
    const md = "- [ ] 未完了\n- [x] 完了";
    const result = fullRoundTrip(md);
    expect(result).toContain("[ ]");
    expect(result).toContain("[x]");
    expect(result).toContain("未完了");
    expect(result).toContain("完了");
  });

  test("タスクリスト（密）が空行なしで保持される", () => {
    const md = "- [x] タスク1\n- [x] タスク2\n- [ ] タスク3";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("タスクリスト（緩い）が空行ありで保持される", () => {
    const md = "- [ ] タスク1\n\n- [x] タスク2\n\n- [ ] タスク3";
    expect(fullRoundTrip(md)).toBe(md);
  });
});

// ==========================================================================
// 8. ブロック引用 (Section 5.1)
// ==========================================================================
describe("仕様8: ブロック引用", () => {
  test("> で出力される", () => {
    const md = "> 引用テキスト";
    const result = fullRoundTrip(md);
    expect(result).toContain("> 引用テキスト");
  });

  test("ネストした引用", () => {
    const md = "> 外側\n>\n> > 内側";
    expect(fullRoundTrip(md)).toBe(md);
  });
});

// ==========================================================================
// 9. 強調・太字 (Section 6.4)
// ==========================================================================
describe("仕様9: 強調・太字", () => {
  test("*text* で強調が出力される", () => {
    const md = "*強調テキスト*";
    const result = fullRoundTrip(md);
    expect(result).toContain("*強調テキスト*");
  });

  test("**text** で太字が出力される", () => {
    const md = "**太字テキスト**";
    const result = fullRoundTrip(md);
    expect(result).toContain("**太字テキスト**");
  });

  test("***text*** で太字強調が出力される", () => {
    const md = "***太字強調***";
    const result = fullRoundTrip(md);
    expect(result).toContain("***太字強調***");
  });

  test("_ ではなく * が使用される", () => {
    const md = "*イタリック*";
    const result = fullRoundTrip(md);
    expect(result).not.toMatch(/_イタリック_/);
    expect(result).toContain("*イタリック*");
  });
});

// ==========================================================================
// 10. 取り消し線 (GFM 拡張, Section 6.5)
// ==========================================================================
describe("仕様10: 取り消し線", () => {
  test("~~text~~ で出力される", () => {
    const md = "~~取り消しテキスト~~";
    const result = fullRoundTrip(md);
    expect(result).toContain("~~取り消しテキスト~~");
  });
});

// ==========================================================================
// 11. リンク・画像 (Section 6.6-6.7)
// ==========================================================================
describe("仕様11: リンク・画像", () => {
  test("インラインリンク [text](url) が出力される", () => {
    const md = "[リンク](https://example.com)";
    const result = fullRoundTrip(md);
    expect(result).toContain("[リンク](https://example.com)");
  });

  test("画像 ![alt](url) が出力される", () => {
    const md = "![画像](https://example.com/img.png)";
    const result = fullRoundTrip(md);
    expect(result).toContain("![画像](https://example.com/img.png)");
  });
});

// ==========================================================================
// 12. バックスラッシュエスケープ (Section 6.1)
// ==========================================================================
describe("仕様12: バックスラッシュエスケープ", () => {
  test("コードスパン内ではエスケープ無効（リテラル）", () => {
    const md = "`foo\\bar`";
    const result = fullRoundTrip(md);
    expect(result).toContain("`foo\\bar`");
  });

  test("コードブロック内ではエスケープ無効（リテラル）", () => {
    const md = "```\nfoo\\bar\n```";
    const result = fullRoundTrip(md);
    expect(result).toContain("foo\\bar");
  });

  test("テーブルセル内の不要なエスケープが除去される", () => {
    const md = "| 項目 |\n| --- |\n| #見出し |";
    const result = fullRoundTrip(md, { withTable: true });
    // テーブルセル内では # のエスケープは不要
    expect(result).not.toContain("\\#");
  });
});

// ==========================================================================
// 13. エンティティ参照 (Section 6.2)
// ==========================================================================
describe("仕様13: エンティティ参照", () => {
  test("コードスパン内ではエンティティ展開されない", () => {
    const md = "`&amp;`";
    const result = fullRoundTrip(md);
    expect(result).toContain("`&amp;`");
  });

  test("コードブロック内ではエンティティ展開されない", () => {
    const md = "```\n&amp; &lt; &gt;\n```";
    const result = fullRoundTrip(md);
    expect(result).toContain("&amp; &lt; &gt;");
  });

  test("テーブルセル内の &gt; がデコードされる", () => {
    const md = "| 値 |\n| --- |\n| x > y |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("x > y");
    expect(result).not.toContain("&gt;");
  });

  test("テーブルセル内の &lt; がデコードされる", () => {
    const md = "| 値 |\n| --- |\n| x < y |";
    const result = fullRoundTrip(md, { withTable: true });
    expect(result).toContain("x < y");
    expect(result).not.toContain("&lt;");
  });
});

// ==========================================================================
// 14. 改行 (Section 6.12-6.13)
// ==========================================================================
describe("仕様14: 改行", () => {
  test("ハードブレーク（バックスラッシュ）が保持される", () => {
    const md = "行1\\\n行2";
    const result = fullRoundTrip(md);
    expect(result).toContain("行1");
    expect(result).toContain("行2");
    // ハードブレークが何らかの形で保持されること（\\ または末尾スペース）
    expect(result).toMatch(/行1(\\\n|  \n)行2/);
  });

  test("段落区切り（空行）が保持される", () => {
    const md = "段落1\n\n段落2";
    expect(fullRoundTrip(md)).toBe(md);
  });

  test("連続空行が保持される", () => {
    const md = "段落1\n\n\n\n段落2";
    expect(fullRoundTrip(md)).toBe(md);
  });
});
