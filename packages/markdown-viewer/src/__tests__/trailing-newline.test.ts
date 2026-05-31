import { getMarkdownFromEditor } from "../types";
import { createTestEditor } from "../testUtils/createTestEditor";
import { applyMarkdownToEditor, setTrailingNewline } from "../utils/editorContentLoader";
import type { Editor } from "@tiptap/core";

describe("末尾改行テスト", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  test("applyMarkdownToEditor 経由: 末尾改行ありのテキストは getMarkdownFromEditor で復元される", () => {
    editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "Hello world\n");
    const md = getMarkdownFromEditor(editor);
    expect(md).toBe("Hello world\n");
  });

  test("applyMarkdownToEditor 経由: 末尾改行なしのテキストは改行なしのまま", () => {
    editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "Hello world");
    const md = getMarkdownFromEditor(editor);
    expect(md).toBe("Hello world");
  });

  test("applyMarkdownToEditor 経由: 複数段落 + 末尾改行", () => {
    editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "# Title\n\nParagraph\n");
    const md = getMarkdownFromEditor(editor);
    expect(md).toBe("# Title\n\nParagraph\n");
  });

  test("applyMarkdownToEditor 経由: フロントマター付き + 末尾改行", () => {
    editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "---\ntitle: test\n---\n\n# Title\n\nBody\n");
    const md = getMarkdownFromEditor(editor);
    expect(md).toBe("# Title\n\nBody\n");
  });

  test("初期 content prop + setTrailingNewline: 初期読み込みでもフラグが機能する", () => {
    editor = createTestEditor({ withMarkdown: true });
    // 初期読み込みと同じパス: content prop で設定後、setTrailingNewline で記録
    editor.commands.setContent("Hello world");
    setTrailingNewline(editor, true);
    const md = getMarkdownFromEditor(editor);
    expect(md).toBe("Hello world\n");
  });

  test("フラグ false の場合は末尾改行を追加しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("Hello world");
    setTrailingNewline(editor, false);
    const md = getMarkdownFromEditor(editor);
    expect(md).toBe("Hello world");
  });

  test("applyMarkdownToEditor 後に複数回 getMarkdownFromEditor しても末尾改行が維持される", () => {
    editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "Hello world\n");
    // 複数回取得しても同じ
    expect(getMarkdownFromEditor(editor)).toBe("Hello world\n");
    expect(getMarkdownFromEditor(editor)).toBe("Hello world\n");
  });
});
