import { extractTableData } from "../../components/spreadsheet/useSpreadsheetSync";
import { createTestEditor } from "../../testUtils/createTestEditor";

const TABLE_HTML = `<table>
  <tr><th>H1</th><th>H2</th></tr>
  <tr><td>A1</td><td>A2</td></tr>
  <tr><td>B1</td><td>B2</td></tr>
</table>`;

describe("useSpreadsheetSync", () => {
  describe("extractTableData", () => {
    test("テーブルノードからデータと範囲を抽出", () => {
      const editor = createTestEditor({ content: TABLE_HTML, withTable: true });
      let tableNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "table") {
          tableNode = node;
          return false;
        }
      });
      expect(tableNode).not.toBeNull();
      const result = extractTableData(tableNode!);
      expect(result.data).toEqual([
        ["H1", "H2"],
        ["A1", "A2"],
        ["B1", "B2"],
      ]);
      expect(result.range).toEqual({ rows: 3, cols: 2 });
      editor.destroy();
    });

    test("空テーブル", () => {
      const editor = createTestEditor({
        content: "<table><tr><th></th></tr></table>",
        withTable: true,
      });
      let tableNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "table") {
          tableNode = node;
          return false;
        }
      });
      const result = extractTableData(tableNode!);
      expect(result.data).toEqual([[""]]);
      expect(result.range).toEqual({ rows: 1, cols: 1 });
      editor.destroy();
    });
  });
});
