import {
  createTestEditor,
  findTextPosition,
  getTableContent,
} from "../testUtils/createTestEditor";
import { moveTableRow, moveTableColumn } from "../utils/tableHelpers";

const TABLE_HTML = `<table>
  <tr><th>H1</th><th>H2</th><th>H3</th></tr>
  <tr><td>A1</td><td>A2</td><td>A3</td></tr>
  <tr><td>B1</td><td>B2</td><td>B3</td></tr>
</table>`;

function createTableEditor() {
  return createTestEditor({ content: TABLE_HTML, withTable: true });
}

function setCursorAt(editor: ReturnType<typeof createTestEditor>, text: string) {
  const pos = findTextPosition(editor, text);
  expect(pos).toBeGreaterThan(-1);
  editor.commands.setTextSelection(pos);
}

describe("moveTableRow", () => {
  test("行を下に移動", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "A1");

    const result = moveTableRow(editor, "down");

    expect(result).toBe(true);
    expect(getTableContent(editor)).toEqual([
      ["H1", "H2", "H3"],
      ["B1", "B2", "B3"],
      ["A1", "A2", "A3"],
    ]);

    editor.destroy();
  });

  test("行を上に移動", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "B1");

    const result = moveTableRow(editor, "up");

    expect(result).toBe(true);
    expect(getTableContent(editor)).toEqual([
      ["H1", "H2", "H3"],
      ["B1", "B2", "B3"],
      ["A1", "A2", "A3"],
    ]);

    editor.destroy();
  });

  test("ヘッダ行の上への移動は不可 (targetIndex=0)", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "A1");

    const result = moveTableRow(editor, "up");

    expect(result).toBe(false);
    expect(getTableContent(editor)).toEqual([
      ["H1", "H2", "H3"],
      ["A1", "A2", "A3"],
      ["B1", "B2", "B3"],
    ]);

    editor.destroy();
  });

  test("最終行の下への移動は不可 (境界)", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "B1");

    const result = moveTableRow(editor, "down");

    expect(result).toBe(false);

    editor.destroy();
  });
});

describe("moveTableColumn", () => {
  test("列を右に移動", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "A1");

    const result = moveTableColumn(editor, "right");

    expect(result).toBe(true);
    expect(getTableContent(editor)).toEqual([
      ["H2", "H1", "H3"],
      ["A2", "A1", "A3"],
      ["B2", "B1", "B3"],
    ]);

    editor.destroy();
  });

  test("列を左に移動", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "A2");

    const result = moveTableColumn(editor, "left");

    expect(result).toBe(true);
    expect(getTableContent(editor)).toEqual([
      ["H2", "H1", "H3"],
      ["A2", "A1", "A3"],
      ["B2", "B1", "B3"],
    ]);

    editor.destroy();
  });

  test("最左列の左への移動は不可 (境界)", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "A1");

    const result = moveTableColumn(editor, "left");

    expect(result).toBe(false);

    editor.destroy();
  });

  test("最右列の右への移動は不可 (境界)", () => {
    const editor = createTableEditor();
    setCursorAt(editor, "A3");

    const result = moveTableColumn(editor, "right");

    expect(result).toBe(false);

    editor.destroy();
  });
});
