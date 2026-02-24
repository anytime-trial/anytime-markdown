import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";

/** テーブルの行を上下に移動するヘルパー */
export function moveTableRow(editor: Editor, direction: "up" | "down") {
  const { state, view } = editor;
  const { $from } = state.selection;
  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") { tableDepth = d; break; }
  }
  if (tableDepth < 0) return false;
  const table = $from.node(tableDepth);
  let rowDepth = -1;
  for (let d = $from.depth; d > tableDepth; d--) {
    if ($from.node(d).type.name === "tableRow") { rowDepth = d; break; }
  }
  if (rowDepth < 0) return false;
  const rowIndex = $from.index(tableDepth);
  const targetIndex = direction === "up" ? rowIndex - 1 : rowIndex + 1;
  if (targetIndex < 0 || targetIndex >= table.childCount) return false;
  if (rowIndex === 0 || targetIndex === 0) return false;
  const tableStart = $from.before(tableDepth) + 1;
  const rows: PMNode[] = [];
  table.forEach((row) => rows.push(row));
  const tmp = rows[rowIndex];
  rows[rowIndex] = rows[targetIndex];
  rows[targetIndex] = tmp;
  const { tr } = state;
  tr.replaceWith(tableStart, tableStart + table.content.size, rows);
  view.dispatch(tr);
  return true;
}

/** テーブルの列を左右に移動するヘルパー */
export function moveTableColumn(editor: Editor, direction: "left" | "right") {
  const { state, view } = editor;
  const { $from } = state.selection;
  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") { tableDepth = d; break; }
  }
  if (tableDepth < 0) return false;
  const table = $from.node(tableDepth);
  let cellDepth = -1;
  for (let d = $from.depth; d > tableDepth; d--) {
    if ($from.node(d).type.name === "tableCell" || $from.node(d).type.name === "tableHeader") { cellDepth = d; break; }
  }
  if (cellDepth < 0) return false;
  const rowNode = $from.node(cellDepth - 1);
  const colIndex = $from.index(cellDepth - 1);
  const targetCol = direction === "left" ? colIndex - 1 : colIndex + 1;
  if (targetCol < 0 || targetCol >= rowNode.childCount) return false;
  const tableStart = $from.before(tableDepth) + 1;
  const newRows: PMNode[] = [];
  table.forEach((row) => {
    const cells: PMNode[] = [];
    row.forEach((cell) => cells.push(cell));
    const tmp = cells[colIndex];
    cells[colIndex] = cells[targetCol];
    cells[targetCol] = tmp;
    newRows.push(row.type.create(row.attrs, cells));
  });
  const { tr } = state;
  tr.replaceWith(tableStart, tableStart + table.content.size, newRows);
  view.dispatch(tr);
  return true;
}
