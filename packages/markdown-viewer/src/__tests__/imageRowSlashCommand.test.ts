import { createTestEditor } from "../testUtils/createTestEditor";
import { insertImagesFromFiles } from "../extensions/slashCommandImageInsert";

function makeFile(name: string, type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("slash command /image with multiple files", () => {
  test("2 files creates imageRow with 2 images", async () => {
    const editor = createTestEditor({ withMarkdown: true });
    await insertImagesFromFiles(editor, [makeFile("a.png"), makeFile("b.png")]);
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"imageRow"');
    expect(json).toContain('"alt":"a.png"');
    expect(json).toContain('"alt":"b.png"');
  });

  test("1 file creates standalone image, not imageRow", async () => {
    const editor = createTestEditor({ withMarkdown: true });
    await insertImagesFromFiles(editor, [makeFile("a.png")]);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
    expect(json).toContain('"alt":"a.png"');
  });

  test("0 files inserts nothing", async () => {
    const editor = createTestEditor({ withMarkdown: true });
    await insertImagesFromFiles(editor, []);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
    expect(json).not.toContain('"type":"image"');
  });
});
