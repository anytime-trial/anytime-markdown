/**
 * CustomTable が table を div.tableWrapper で包んで描画することの回帰テスト。
 *
 * resizable:false 構成では native TableView（wrapper 生成 NodeView）が無効になるため、
 * renderHTML 側で .tableWrapper を出力する（renderWrapper:true）必要がある。
 * これが無いと狭幅で表が横スクロールできず本文をはみ出す（実機回帰）。
 * 横スクロール容器化の CSS は editorContentCss の .tableWrapper ルールが担う。
 */
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { TableKit } from "@anytime-markdown/markdown-extension-table";
import { Markdown } from "@anytime-markdown/markdown-md";

import { CustomTable } from "../tableExtension";
import { CustomTableCell, CustomTableHeader } from "../extensions/customTableCells";

function createEditor(md: string): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
      CustomTable.configure({ resizable: false }),
      CustomTableCell,
      CustomTableHeader,
      Markdown.configure({ html: true }),
    ],
  });
  editor.commands.setContent(md);
  return editor;
}

const TABLE_MD = "| A | B |\n| - | - |\n| 1 | 2 |\n";

describe("CustomTable の tableWrapper 描画", () => {
  it("renderWrapper 既定が true である（resizable:false でも wrapper を生成する）", () => {
    expect(CustomTable.options.renderWrapper).toBe(true);
  });

  it("テーブルが div.tableWrapper > table の構造で描画される", () => {
    const editor = createEditor(TABLE_MD);
    const wrapper = editor.view.dom.querySelector(".tableWrapper");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.tagName.toLowerCase()).toBe("div");
    // wrapper 直下に table が存在し、セル編集用の contentDOM が保たれる
    expect(wrapper?.querySelector("table")).not.toBeNull();
    editor.destroy();
  });
});
