import { createTestEditor } from "../testUtils/createTestEditor";

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
