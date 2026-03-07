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
    console.log("Input: ", md);
    console.log("Output:", result);
    expect(result).toBe(md);
  });

  test("&gt; in code span - inline", () => {
    const md = "`&gt;` → `>`";
    const result = fullRoundTrip(md);
    console.log("Input: ", md);
    console.log("Output:", result);
    expect(result).toBe(md);
  });

  test("&amp; in code span - inline", () => {
    const md = "`&amp;` → `&`";
    const result = fullRoundTrip(md);
    console.log("Input: ", md);
    console.log("Output:", result);
    expect(result).toBe(md);
  });

  test("entities in table cell code spans", () => {
    const md = "| 種類 | 例 |\n| --- | --- |\n| HTML | `&amp;` → `&`, `&lt;` → `<`, `&gt;` → `>` |";
    const result = fullRoundTrip(md);
    console.log("Input: ", md);
    console.log("Output:", result);
    expect(result).toContain("`&amp;`");
    expect(result).toContain("`&lt;`");
    expect(result).toContain("`&gt;`");
  });

  test("pipe in table cell code span is restored", () => {
    const md = "| col |\n| --- |\n| b `\\|` az |";
    const result = fullRoundTrip(md);
    console.log("Input: ", md);
    console.log("Output:", result);
    expect(result).toContain("`\\|`");
    expect(result).not.toContain("&#124;");
  });

  test("ProseMirror stores &lt; correctly - inline", () => {
    const md = "`&lt;`";
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));

    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "code")) {
        const codes = [...node.text!].map((c) => c.charCodeAt(0));
        console.log(`Inline code text: "${node.text}" charCodes: [${codes}]`);
      }
    });
  });

  test("ProseMirror stores &lt; correctly - table cell", () => {
    const md = "| col |\n| --- |\n| `&lt;` |";
    editor = createTestEditor({ withMarkdown: true, withTable: true });
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));

    editor.state.doc.descendants((node) => {
      if (node.isText) {
        const marks = node.marks.map((m) => m.type.name);
        const codes = [...node.text!].map((c) => c.charCodeAt(0));
        console.log(`Table text: "${node.text}" marks=[${marks}] charCodes: [${codes}]`);
      }
    });
  });
});
