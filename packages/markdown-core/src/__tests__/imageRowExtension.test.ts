import { createTestEditor } from "../testUtils/createTestEditor";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";

describe("imageRow schema", () => {
  test("can insert imageRow with 2 images", () => {
    const editor = createTestEditor({ withMarkdown: true });
    editor.commands.insertContent({
      type: "imageRow",
      content: [
        { type: "image", attrs: { src: "a.png", alt: "a" } },
        { type: "image", attrs: { src: "b.png", alt: "b" } },
      ],
    });
    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"imageRow"');
    expect(JSON.stringify(json)).toContain('"src":"a.png"');
    expect(JSON.stringify(json)).toContain('"src":"b.png"');
  });

  test("ImageRowNodeView renders flex container", () => {
    const editor = createTestEditor({ withMarkdown: true });
    editor.commands.insertContent({
      type: "imageRow",
      content: [
        { type: "image", attrs: { src: "a.png", alt: "a" } },
        { type: "image", attrs: { src: "b.png", alt: "b" } },
      ],
    });
    const container = editor.view.dom.querySelector("[data-image-row]");
    expect(container).not.toBeNull();
    expect(container?.getAttribute("class")).toContain("image-row");
  });

  test("imageRow with 1 child collapses to standalone image", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)![b](b.png)\n");
    // Delete the b image
    const tr = editor.state.tr;
    const toDelete: Array<{ pos: number; size: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && node.attrs.src === "b.png") {
        toDelete.push({ pos, size: node.nodeSize });
      }
    });
    toDelete.reverse().forEach(({ pos, size }) => tr.delete(pos, pos + size));
    editor.view.dispatch(tr);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
    expect(json).toContain('"src":"a.png"');
  });

  test("imageRow with 0 children is removed", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)![b](b.png)\n");
    const tr = editor.state.tr;
    const toDelete: Array<{ pos: number; size: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        toDelete.push({ pos, size: node.nodeSize });
      }
    });
    toDelete.reverse().forEach(({ pos, size }) => tr.delete(pos, pos + size));
    editor.view.dispatch(tr);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
  });

  test("imageRow rejects paragraph content", () => {
    const editor = createTestEditor({ withMarkdown: true });
    let threw = false;
    try {
      editor.commands.insertContent({
        type: "imageRow",
        content: [{ type: "paragraph" }],
      });
    } catch {
      threw = true;
    }
    const json = JSON.stringify(editor.getJSON());
    // Either ProseMirror throws for invalid content, or the paragraph is silently
    // filtered out. In both cases, no paragraph must appear inside imageRow.
    expect(threw || !json.includes('"type":"imageRow"')).toBe(true);
    expect(json).not.toMatch(/"type":"imageRow"[^}]*"type":"paragraph"/);
  });
});
