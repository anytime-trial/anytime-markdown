import { createTestEditor } from "../testUtils/createTestEditor";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";

describe("imageRow markdown parse", () => {
  test("consecutive images without newline become imageRow", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)![b](b.png)\n");
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"imageRow"');
  });

  test("images separated by blank line stay as independent blocks", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)\n\n![b](b.png)\n");
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
  });

  test("single image is not wrapped in imageRow", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)\n");
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
  });

  test("images with surrounding text stay as paragraph", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "hello ![a](a.png) ![b](b.png) world\n");
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
  });

  test("images separated only by whitespace become imageRow", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png) ![b](b.png)\n");
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"imageRow"');
  });
});
