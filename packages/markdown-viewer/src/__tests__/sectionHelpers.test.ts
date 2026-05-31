import { createTestEditor } from "../testUtils/createTestEditor";
import {
  getSectionRange,
  moveHeadingSection,
} from "../utils/sectionHelpers";
import { extractHeadings } from "../types";

describe("getSectionRange", () => {
  test("最初の見出しから次の同レベル見出しの手前までを返す", () => {
    const editor = createTestEditor({
      content: "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p>",
    });
    const doc = editor.state.doc;

    let h1APos = -1;
    let h1BPos = -1;
    doc.forEach((node, offset) => {
      if (node.type.name === "heading") {
        if (h1APos === -1) h1APos = offset;
        else h1BPos = offset;
      }
    });

    const range = getSectionRange(doc, h1APos, 1);
    expect(range.from).toBe(h1APos);
    expect(range.to).toBe(h1BPos);

    editor.destroy();
  });

  test("最後の見出しはドキュメント末尾までを返す", () => {
    const editor = createTestEditor({
      content: "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p>",
    });
    const doc = editor.state.doc;

    let lastHeadingPos = -1;
    doc.forEach((node, offset) => {
      if (node.type.name === "heading") lastHeadingPos = offset;
    });

    const range = getSectionRange(doc, lastHeadingPos, 1);
    expect(range.from).toBe(lastHeadingPos);
    expect(range.to).toBe(doc.content.size);

    editor.destroy();
  });

  test("下位レベルの見出しはセクション範囲に含まれる", () => {
    const editor = createTestEditor({
      content: "<h1>A</h1><h2>A.1</h2><p>sub</p><h1>B</h1>",
    });
    const doc = editor.state.doc;

    let h1APos = -1;
    let h1BPos = -1;
    doc.forEach((node, offset) => {
      if (node.type.name === "heading" && (node.attrs.level as number) === 1) {
        if (h1APos === -1) h1APos = offset;
        else h1BPos = offset;
      }
    });

    const range = getSectionRange(doc, h1APos, 1);
    expect(range.from).toBe(h1APos);
    expect(range.to).toBe(h1BPos);

    editor.destroy();
  });
});

describe("moveHeadingSection", () => {
  /** ヘルパー: ドキュメント内の見出しテキストを順番に取得 */
  function getHeadingTexts(editor: ReturnType<typeof createTestEditor>): string[] {
    const texts: string[] = [];
    editor.state.doc.forEach((node) => {
      if (node.type.name === "heading") texts.push(node.textContent);
    });
    return texts;
  }

  test("セクションを後方(下)に移動 — AをCの位置へ", () => {
    const editor = createTestEditor({
      content:
        "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p><h1>C</h1><p>text C</p>",
    });
    const headings = extractHeadings(editor);

    moveHeadingSection(editor, headings, 0, 2);

    expect(getHeadingTexts(editor)).toEqual(["B", "A", "C"]);

    editor.destroy();
  });

  test("セクションを前方(上)に移動 — CをAの位置へ", () => {
    const editor = createTestEditor({
      content:
        "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p><h1>C</h1><p>text C</p>",
    });
    const headings = extractHeadings(editor);

    moveHeadingSection(editor, headings, 2, 0);

    expect(getHeadingTexts(editor)).toEqual(["C", "A", "B"]);

    editor.destroy();
  });

  test("隣接セクションへの移動はno-op (targetPos === src.to)", () => {
    const editor = createTestEditor({
      content: "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p>",
    });
    const headings = extractHeadings(editor);
    const before = editor.state.doc.textContent;

    moveHeadingSection(editor, headings, 0, 1);

    expect(editor.state.doc.textContent).toBe(before);

    editor.destroy();
  });

  test("同一セクションへの移動はno-op", () => {
    const editor = createTestEditor({
      content: "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p>",
    });
    const headings = extractHeadings(editor);
    const before = editor.state.doc.textContent;

    moveHeadingSection(editor, headings, 0, 0);

    expect(editor.state.doc.textContent).toBe(before);

    editor.destroy();
  });

  test("toIdx=-1 でセクションを末尾に移動", () => {
    const editor = createTestEditor({
      content:
        "<h1>A</h1><p>text A</p><h1>B</h1><p>text B</p><h1>C</h1><p>text C</p>",
    });
    const headings = extractHeadings(editor);

    moveHeadingSection(editor, headings, 0, -1);

    expect(getHeadingTexts(editor)).toEqual(["B", "C", "A"]);

    editor.destroy();
  });
});
