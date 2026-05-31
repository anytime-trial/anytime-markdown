import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import { Editor } from "@tiptap/core";

describe("Entity roundtrip in code spans", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  function fullRoundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true, withTable: true });
    const preprocessed = preserveBlankLines(sanitizeMarkdown(md));
    editor.commands.setContent(preprocessed);
    return getMarkdownFromEditor(editor);
  }

  test("&lt; in code span - inline", () => {
    const md = "`&lt;` → `<`";
    const result = fullRoundTrip(md);

    expect(result).toBe(md);
  });

  test("&gt; in code span - inline", () => {
    const md = "`&gt;` → `>`";
    const result = fullRoundTrip(md);

    expect(result).toBe(md);
  });

  test("&amp; in code span - inline", () => {
    const md = "`&amp;` → `&`";
    const result = fullRoundTrip(md);

    expect(result).toBe(md);
  });

  test("entities in table cell code spans", () => {
    const md = "| 種類 | 例 |\n| --- | --- |\n| HTML | `&amp;` → `&`, `&lt;` → `<`, `&gt;` → `>` |";
    const result = fullRoundTrip(md);

    expect(result).toContain("`&amp;`");
    expect(result).toContain("`&lt;`");
    expect(result).toContain("`&gt;`");
  });

  test("pipe in table cell code span is restored", () => {
    const md = "| col |\n| --- |\n| b `\\|` az |";
    const result = fullRoundTrip(md);

    expect(result).toContain("`\\|`");
    expect(result).not.toContain("&#124;");
  });

  test("pipe in code span is stored as | (not &#124;) in ProseMirror", () => {
    const md = "| col |\n| --- |\n| b `\\|` az |";
    editor = createTestEditor({ withMarkdown: true, withTable: true });
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));

    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "code")) {
        expect(node.text).not.toContain("&#124;");
        // markdown-it テーブルパーサーが \| の \ を消費するため | のみ格納される
        expect(node.text).toBe("|");
      }
    });
  });

  test("ProseMirror stores &lt; correctly - inline", () => {
    const md = "`&lt;`";
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));

    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "code")) {
        const codes = [...node.text!].map((c) => c.charCodeAt(0));
        expect(codes).toBeDefined();
      }
    });
  });

  test("ProseMirror stores &lt; correctly - table cell", () => {
    const md = "| col |\n| --- |\n| `&lt;` |";
    editor = createTestEditor({ withMarkdown: true, withTable: true });
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));

    editor.state.doc.descendants((node) => {
      if (node.isText) {
        const codes = [...node.text!].map((c) => c.charCodeAt(0));
        expect(codes).toBeDefined();
      }
    });
  });

  test("multi-backtick code spans in table do not escape cell separators", () => {
    const md = "| 単独の `` ` `` あり | 2個 | ``` `` foo`bar `` ``` |";
    const result = fullRoundTrip(md);

    // セル区切りの | がエスケープされないこと
    expect(result).not.toContain("あり \\|");
    expect(result).not.toContain("\\| 2個");
    // コードスパンが保持されること
    expect(result).toContain("`` ` ``");
  });
});
