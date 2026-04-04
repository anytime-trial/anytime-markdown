import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

import type { CellAlign, DataRange } from "./spreadsheetTypes";

/**
 * ProseMirror テーブルノードからセルデータと配置情報を抽出する純粋関数。
 */
export function extractTableData(tableNode: PMNode): {
  data: string[][];
  range: DataRange;
  alignments: CellAlign[][];
} {
  const data: string[][] = [];
  const alignments: CellAlign[][] = [];
  tableNode.forEach((rowNode) => {
    const row: string[] = [];
    const rowAligns: CellAlign[] = [];
    rowNode.forEach((cellNode) => {
      row.push(cellNode.textContent);
      const align = cellNode.attrs.textAlign as string | null;
      rowAligns.push(
        align === "center" || align === "right" || align === "left" ? align : null,
      );
    });
    data.push(row);
    alignments.push(rowAligns);
  });
  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  return { data, range: { rows, cols }, alignments };
}

interface UseSpreadsheetSyncOptions {
  readonly editor: Editor | null;
}

/**
 * ProseMirror テーブルノードとスプレッドシートグリッドを同期する Hook。
 * マウント時にテーブルデータを抽出してグリッドを初期化し、
 * セル・行・列の変更を ProseMirror に書き戻す関数を返す。
 */
export function useSpreadsheetSync({
  editor,
}: UseSpreadsheetSyncOptions) {

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

  /**
   * グリッドデータと新しいデータ範囲から ProseMirror テーブルを丸ごと再構築する。
   * 範囲変更時（リサイズ、行/列の追加削除）に呼び出す。
   */
  const rebuildTable = useCallback(
    (grid: string[][], newRange: DataRange, cellAlignments?: CellAlign[][]) => {
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

      const { schema } = editor.state;
      const tableType = schema.nodes.table;
      const rowType = schema.nodes.tableRow;
      const cellType = schema.nodes.tableCell;
      const headerType = schema.nodes.tableHeader;
      const paragraphType = schema.nodes.paragraph;

      const rows: PMNode[] = [];
      for (let r = 0; r < newRange.rows; r++) {
        const cells: PMNode[] = [];
        for (let c = 0; c < newRange.cols; c++) {
          const text = grid[r]?.[c] ?? "";
          const paragraph = paragraphType.create(
            null,
            text ? schema.text(text) : null,
          );
          const type = r === 0 ? headerType : cellType;
          const align = cellAlignments?.[r]?.[c] ?? null;
          cells.push(type.create(align ? { textAlign: align } : null, paragraph));
        }
        rows.push(rowType.create(null, cells));
      }

      const newTable = tableType.create(tableNode.attrs, rows);
      const { tr } = editor.state;
      tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable);
      editor.view.dispatch(tr);
    },
    [editor],
  );

  return { syncCellToProseMirror, rebuildTable };
}
