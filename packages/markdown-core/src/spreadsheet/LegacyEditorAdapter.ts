import type {
  CellAlign,
  SheetAdapter,
  SheetSnapshot,
} from "@anytime-markdown/spreadsheet-core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

import { extractTableData } from "../components/spreadsheet/useSpreadsheetSync";

/**
 * Phase 2 の一時ブリッジ Adapter。
 *
 * tiptap の Editor と table ノード位置コールバックを受け取り、
 * 既存の extractTableData / rebuildTable ロジックで SheetAdapter を実装する。
 *
 * Phase 3 で TiptapSheetAdapter に置き換えて削除する予定。
 */
export function createLegacyEditorAdapter(
  editor: Editor,
  getTable: () => { node: PMNode; pos: number } | null,
  options?: { readOnly?: boolean },
): SheetAdapter {
  const readOnly = options?.readOnly ?? false;

  const getSnapshot = (): SheetSnapshot => {
    const target = getTable();
    if (!target) {
      return { cells: [], alignments: [], range: { rows: 0, cols: 0 } };
    }
    const { data, range, alignments } = extractTableData(target.node);
    return { cells: data, alignments, range };
  };

  const rebuild = (next: SheetSnapshot): void => {
    if (readOnly) return;
    const target = getTable();
    if (!target) return;

    const { node: tableNode, pos: tablePos } = target;
    const { schema } = editor.state;
    const tableType = schema.nodes.table;
    const rowType = schema.nodes.tableRow;
    const cellType = schema.nodes.tableCell;
    const headerType = schema.nodes.tableHeader;
    const paragraphType = schema.nodes.paragraph;

    const rows: PMNode[] = [];
    for (let r = 0; r < next.range.rows; r++) {
      const cells: PMNode[] = [];
      for (let c = 0; c < next.range.cols; c++) {
        const text = next.cells[r]?.[c] ?? "";
        const paragraph = paragraphType.create(
          null,
          text ? schema.text(text) : null,
        );
        const type = r === 0 ? headerType : cellType;
        const align: CellAlign = next.alignments[r]?.[c] ?? null;
        cells.push(type.create(align ? { textAlign: align } : null, paragraph));
      }
      rows.push(rowType.create(null, cells));
    }

    const newTable = tableType.create(tableNode.attrs, rows);
    const { tr } = editor.state;
    tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable);
    editor.view.dispatch(tr);
  };

  return {
    getSnapshot,
    subscribe(listener) {
      const cb = () => {
        listener();
      };
      editor.on("transaction", cb);
      return () => {
        editor.off("transaction", cb);
      };
    },
    setCell(row, col, value) {
      if (readOnly) return;
      // セル単体更新もスナップショット再構築経由で行う（Phase 2 の簡易実装）
      const snap = getSnapshot();
      const cells = snap.cells.map((r) => [...r]);
      if (cells[row]) {
        cells[row][col] = value;
      }
      rebuild({ cells, alignments: snap.alignments, range: snap.range });
    },
    replaceAll(next) {
      rebuild(next);
    },
    readOnly,
  };
}
