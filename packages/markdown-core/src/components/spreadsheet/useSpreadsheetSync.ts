import { useCallback, useEffect } from "react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import type { DataRange } from "./spreadsheetTypes";

/**
 * ProseMirror テーブルノードからセルデータを抽出する純粋関数。
 * 行 -> セルを走査し、2D 配列とデータ範囲を返す。
 */
export function extractTableData(tableNode: PMNode): {
  data: string[][];
  range: DataRange;
} {
  const data: string[][] = [];
  tableNode.forEach((rowNode) => {
    const row: string[] = [];
    rowNode.forEach((cellNode) => {
      row.push(cellNode.textContent);
    });
    data.push(row);
  });
  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  return { data, range: { rows, cols } };
}

interface UseSpreadsheetSyncOptions {
  readonly editor: Editor | null;
  readonly initGrid: (data: string[][]) => void;
  readonly setDataRange: (range: DataRange) => void;
}

/**
 * ProseMirror テーブルノードとスプレッドシートグリッドを同期する Hook。
 * マウント時にテーブルデータを抽出してグリッドを初期化し、
 * セル・行・列の変更を ProseMirror に書き戻す関数を返す。
 */
export function useSpreadsheetSync({
  editor,
  initGrid,
  setDataRange,
}: UseSpreadsheetSyncOptions) {
  useEffect(() => {
    if (!editor) return;
    let tableNode: PMNode | null = null;
    editor.state.doc.descendants((node) => {
      if (tableNode) return false;
      if (node.type.name === "table") {
        tableNode = node;
        return false;
      }
    });
    if (!tableNode) return;
    const { data, range } = extractTableData(tableNode);
    initGrid(data);
    setDataRange(range);
  }, [editor, initGrid, setDataRange]);

  const syncCellToProseMirror = useCallback(
    (row: number, col: number, value: string) => {
      if (!editor) return;

      let tablePos = -1;
      let foundTable: PMNode | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (foundTable) return false;
        if (node.type.name === "table") {
          foundTable = node;
          tablePos = pos;
          return false;
        }
      });
      if (!foundTable || tablePos < 0) return;
      const tableNode: PMNode = foundTable;

      // Calculate cell position by traversing row by row, cell by cell
      let cellPos = tablePos + 1; // Inside table
      for (let r = 0; r < row; r++) {
        cellPos += tableNode.child(r).nodeSize;
      }
      cellPos += 1; // Inside tableRow
      const rowNode = tableNode.child(row);
      for (let c = 0; c < col; c++) {
        cellPos += rowNode.child(c).nodeSize;
      }

      // Replace cell content
      const cell = rowNode.child(col);
      const from = cellPos + 1; // Inside cell (paragraph start)
      const to = cellPos + cell.nodeSize - 1; // Before cell end
      const { tr } = editor.state;
      const { schema } = editor.state;
      const paragraph = schema.nodes.paragraph.create(
        null,
        value ? schema.text(value) : null,
      );
      tr.replaceWith(from, to, paragraph);
      editor.view.dispatch(tr);
    },
    [editor],
  );

  const addRowToProseMirror = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().addRowAfter().run();
  }, [editor]);

  const addColToProseMirror = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().addColumnAfter().run();
  }, [editor]);

  return { syncCellToProseMirror, addRowToProseMirror, addColToProseMirror };
}
