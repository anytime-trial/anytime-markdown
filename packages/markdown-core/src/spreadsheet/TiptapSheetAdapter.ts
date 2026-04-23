import type {
  CellAlign,
  SheetAdapter,
  SheetSnapshot,
} from "@anytime-markdown/spreadsheet-core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

const EMPTY_SNAPSHOT: SheetSnapshot = {
  cells: [],
  alignments: [],
  range: { rows: 0, cols: 0 },
};

/** tiptap table ノードからスナップショットを抽出する純粋関数 */
function extractSnapshot(tableNode: PMNode): SheetSnapshot {
  const cells: string[][] = [];
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
    cells.push(row);
    alignments.push(rowAligns);
  });
  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  return { cells, alignments, range: { rows, cols } };
}

/**
 * SheetAdapter の tiptap 実装。
 *
 * getTable コールバックで追跡対象の table ノードと pos を返すことで、
 * 複数 table を含む文書でも個別 table に Adapter を割り当てられる。
 * subscribe は該当 table の変更だけを listener に通知する最適化を含む。
 *
 * useSyncExternalStore 要件: getSnapshot は table の内容が変わらない限り
 * 同じ参照を返す必要がある。内部でシグネチャ（node.toString()）ベースで
 * キャッシュする。
 */
export function createTiptapSheetAdapter(
  editor: Editor,
  getTable: () => { node: PMNode; pos: number } | null,
  options?: { readOnly?: boolean },
): SheetAdapter {
  const readOnly = options?.readOnly ?? false;

  /** useSyncExternalStore 用の参照安定キャッシュ */
  let cachedSignature: string | null = null;
  let cachedSnapshot: SheetSnapshot = EMPTY_SNAPSHOT;

  const currentSignature = (): string => {
    try {
      const target = getTable();
      return target ? target.node.toString() : "";
    } catch {
      return "";
    }
  };

  const getSnapshot = (): SheetSnapshot => {
    const sig = currentSignature();
    if (cachedSignature === sig) {
      return cachedSnapshot;
    }
    let target: { node: PMNode; pos: number } | null = null;
    try {
      target = getTable();
    } catch {
      target = null;
    }
    cachedSignature = sig;
    cachedSnapshot = target ? extractSnapshot(target.node) : EMPTY_SNAPSHOT;
    return cachedSnapshot;
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
      // 各 subscriber が独立した lastSignature を持つ（listener 毎に判定）
      let lastSignature = currentSignature();
      const cb = () => {
        const sig = currentSignature();
        if (sig !== lastSignature) {
          lastSignature = sig;
          listener();
        }
      };
      editor.on("transaction", cb);
      return () => {
        editor.off("transaction", cb);
      };
    },
    setCell(row, col, value) {
      if (readOnly) return;
      const target = getTable();
      if (!target) return;
      const snap = extractSnapshot(target.node);
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
