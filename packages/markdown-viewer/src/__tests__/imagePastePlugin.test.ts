import { createTestEditor } from "../testUtils/createTestEditor";

function makeFile(name: string, type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function pasteFiles(editor: ReturnType<typeof createTestEditor>, files: File[]): void {
  const clipboardData = {
    files: files as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: files.length > 0 ? ["Files"] : [],
    getData: () => "",
  };
  const ev = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(ev, "clipboardData", { value: clipboardData });
  editor.view.dom.dispatchEvent(ev);
}

describe("image paste", () => {
  test("pasting 2 image files creates imageRow", async () => {
    const editor = createTestEditor({ withMarkdown: true });
    pasteFiles(editor, [makeFile("a.png"), makeFile("b.png")]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"imageRow"');
  });

  test("pasting 1 image file creates standalone image", async () => {
    const editor = createTestEditor({ withMarkdown: true });
    pasteFiles(editor, [makeFile("a.png")]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
    expect(json).toContain('"type":"image"');
  });

  test("pasting no image files does not handle", async () => {
    const editor = createTestEditor({ withMarkdown: true });
    const nonImage = new File(["hello"], "a.txt", { type: "text/plain" });
    pasteFiles(editor, [nonImage]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
    expect(json).not.toContain('"type":"image"');
  });
});
