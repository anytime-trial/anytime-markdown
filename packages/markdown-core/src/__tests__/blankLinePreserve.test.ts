import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import { Editor } from "@tiptap/core";

describe("2行の空行ラウンドトリップ", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  function fullRoundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    const preprocessed = preserveBlankLines(sanitizeMarkdown(md));
    editor.commands.setContent(preprocessed);
    return getMarkdownFromEditor(editor);
  }

  test("見出し間の2行空行（3改行）が保持される", () => {
    const md = "## Heading1\n\n\n## Heading2";
    const result = fullRoundTrip(md);
    expect(result).toBe(md);
  });

  test("見出し間の2行空行 - 2回ラウンドトリップ", () => {
    const md = "## Heading1\n\n\n## Heading2";
    const result1 = fullRoundTrip(md);
    editor.destroy();
    const result2 = fullRoundTrip(result1);
    expect(result2).toBe(md);
  });

  test("defaultContent.md の見出し上2行空行が保持される", () => {
    const md = "# Title\n\nIntro text.\n\n\n## Section 1\n\nContent.\n\n\n## Section 2\n\nMore content.";
    const result = fullRoundTrip(md);
    expect(result).toBe(md);
  });

  test("preserveBlankLines なしの setContent では2行空行が1行に減る（バグ再現）", () => {
    const md = "## Heading1\n\n\n## Heading2";
    editor = createTestEditor({ withMarkdown: true });
    // preserveBlankLines を適用せずに setContent（vscode-set-content バグの再現）
    editor.commands.setContent(md);
    const result = getMarkdownFromEditor(editor);
    // preserveBlankLines なしでは空行が失われる
    expect(result).not.toBe(md);
    expect(result).toBe("## Heading1\n\n## Heading2");
  });

  test("preserveBlankLines 適用済みの setContent では2行空行が保持される", () => {
    const md = "## Heading1\n\n\n## Heading2";
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));
    const result = getMarkdownFromEditor(editor);
    expect(result).toBe(md);
  });
});
