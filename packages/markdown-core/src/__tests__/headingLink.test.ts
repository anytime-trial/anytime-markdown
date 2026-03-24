import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import { Editor } from "@tiptap/core";

describe("見出し内リンクのラウンドトリップ", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  function fullRoundTrip(md: string): string {
    editor = createTestEditor({ withMarkdown: true });
    const preprocessed = preserveBlankLines(sanitizeMarkdown(md));
    editor.commands.setContent(preprocessed);
    return getMarkdownFromEditor(editor);
  }

  test("見出し内の相対パスリンクが保持される", () => {
    const md = "## [ファイル: test.ts](packages/test.ts#L1)";
    const result = fullRoundTrip(md);
    expect(result).toContain("[ファイル: test.ts]");
    expect(result).toContain("(packages/test.ts#L1)");
  });

  test("見出し内の絶対URLリンクが保持される", () => {
    const md = "## [Example](https://example.com)";
    const result = fullRoundTrip(md);
    expect(result).toContain("[Example]");
    expect(result).toContain("(https://example.com)");
  });

  test("段落内の相対パスリンクが保持される", () => {
    const md = "[test](packages/test.ts)";
    const result = fullRoundTrip(md);
    expect(result).toContain("[test]");
    expect(result).toContain("(packages/test.ts)");
  });

  test("./付き相対パスリンクが保持される", () => {
    const md = "[test](./packages/test.ts)";
    const result = fullRoundTrip(md);
    expect(result).toContain("[test]");
    expect(result).toContain("(./packages/test.ts)");
  });
});
