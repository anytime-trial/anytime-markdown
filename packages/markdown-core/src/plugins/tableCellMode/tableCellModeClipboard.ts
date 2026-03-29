import type { EditorView } from "@tiptap/pm/view";
import { TableMap } from "prosemirror-tables";
import { tableCellModePluginKey, setNavigationMode } from "./tableCellModePlugin";

// ----------------------------------------------------------------
// Pure utility functions
// ----------------------------------------------------------------

/** 2D 配列を TSV 文字列に変換する */
export function cellContentToTsv(data: readonly (readonly string[])[]): string {
  return data.map((row) => row.join("\t")).join("\n");
}

/** TSV 文字列を 2D 配列に変換する */
export function tsvToCellContent(tsv: string): string[][] {
  // 末尾の改行を除去してから分割
  const trimmed = tsv.endsWith("\n") ? tsv.slice(0, -1) : tsv;
  return trimmed.split("\n").map((line) => line.split("\t"));
}

/**
 * クリップボードのプレーンテキストが TSV 形式かを検出する。
 * タブ文字を含む場合は TSV として 2D 配列を返し、そうでなければ null を返す。
 */
export function parseClipboardTable(
  plainText: string,
  _htmlText: string,
): string[][] | null {
  if (!plainText || !plainText.includes("\t")) {
    return null;
  }
  return tsvToCellContent(plainText);
}

// ----------------------------------------------------------------
// Cell content helpers
// ----------------------------------------------------------------

/** セルのテキスト内容を取得する */
function getCellText(view: EditorView, cellPos: number): string {
  return view.state.doc.nodeAt(cellPos)?.textContent ?? "";
}

/** セル内容を指定テキストで置換する（空文字列の場合は空の paragraph） */
function replaceCellContent(
  view: EditorView,
  cellPos: number,
  text: string,
  dispatch: boolean = true,
): import("@tiptap/pm/state").Transaction | null {
  const { doc, schema, tr } = view.state;
  const cell = doc.nodeAt(cellPos);
  if (!cell) return null;

  const from = cellPos + 1;
  const to = cellPos + cell.nodeSize - 1;
  if (from >= to) return null;

  const content = text
    ? schema.nodes.paragraph.create(null, schema.text(text))
    : schema.nodes.paragraph.create();
  tr.replaceWith(from, to, content);

  if (dispatch) {
    view.dispatch(tr);
  }
  return tr;
}

// ----------------------------------------------------------------
// Table position helpers
// ----------------------------------------------------------------

/** テーブルノードとその開始位置を取得する */
function findTable(
  view: EditorView,
  cellPos: number,
): { tableNode: import("@tiptap/pm/model").Node; tableStart: number } | null {
  const { doc } = view.state;
  try {
    const $pos = doc.resolve(cellPos);
    for (let depth = $pos.depth; depth >= 0; depth--) {
      if ($pos.node(depth).type.name === "table") {
        return {
          tableNode: $pos.node(depth),
          tableStart: $pos.before(depth) + 1,
        };
      }
    }
  } catch {
    // 位置が無効
  }
  return null;
}

/** 指定セルからの相対位置にあるセルの絶対位置を返す */
function getCellPosAt(
  view: EditorView,
  cellPos: number,
  rowOffset: number,
  colOffset: number,
): number | null {
  const table = findTable(view, cellPos);
  if (!table) return null;

  const { tableNode, tableStart } = table;
  const map = TableMap.get(tableNode);
  const cellOffset = cellPos - tableStart;
  const cellIndex = map.map.indexOf(cellOffset);
  if (cellIndex === -1) return null;

  const col = cellIndex % map.width;
  const row = Math.floor(cellIndex / map.width);

  const targetRow = row + rowOffset;
  const targetCol = col + colOffset;

  if (targetRow < 0 || targetRow >= map.height) return null;
  if (targetCol < 0 || targetCol >= map.width) return null;

  return tableStart + map.map[targetRow * map.width + targetCol];
}

// ----------------------------------------------------------------
// Multi-cell paste
// ----------------------------------------------------------------

/** TSV データを起点セルから貼り付ける */
function pasteTableData(
  view: EditorView,
  startCellPos: number,
  data: readonly (readonly string[])[],
): void {
  const { state } = view;
  const { schema } = state;
  let { tr } = state;

  for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const targetPos = getCellPosAt(view, startCellPos, rowIdx, colIdx);
      if (targetPos == null) continue;

      // マッピングで位置を更新（前の置換で位置がずれるため）
      const mappedPos = tr.mapping.map(targetPos);
      const cell = tr.doc.nodeAt(mappedPos);
      if (!cell) continue;

      const from = mappedPos + 1;
      const to = mappedPos + cell.nodeSize - 1;
      if (from >= to) continue;

      const text = row[colIdx];
      const content = text
        ? schema.nodes.paragraph.create(null, schema.text(text))
        : schema.nodes.paragraph.create();
      tr = tr.replaceWith(from, to, content);
    }
  }

  if (tr.docChanged) {
    view.dispatch(tr);
  }
}

// ----------------------------------------------------------------
// DOM event handlers
// ----------------------------------------------------------------

/**
 * navigation モードでのコピー処理。
 * 選択セルのテキストをクリップボードにコピーする。
 */
export function handleCopy(
  view: EditorView,
  event: ClipboardEvent,
): boolean {
  const pluginState = tableCellModePluginKey.getState(view.state);
  if (!pluginState) return false;
  if (pluginState.mode !== "navigation" || pluginState.selectedCellPos == null) {
    return false;
  }

  const cellText = getCellText(view, pluginState.selectedCellPos);
  event.preventDefault();
  event.clipboardData?.setData("text/plain", cellText);
  return true;
}

/**
 * navigation モードでのカット処理。
 * 選択セルのテキストをクリップボードにコピーし、セル内容をクリアする。
 */
export function handleCut(
  view: EditorView,
  event: ClipboardEvent,
): boolean {
  const pluginState = tableCellModePluginKey.getState(view.state);
  if (!pluginState) return false;
  if (pluginState.mode !== "navigation" || pluginState.selectedCellPos == null) {
    return false;
  }

  const cellPos = pluginState.selectedCellPos;
  const cellText = getCellText(view, cellPos);
  event.preventDefault();
  event.clipboardData?.setData("text/plain", cellText);

  // セル内容をクリアする
  replaceCellContent(view, cellPos, "");
  return true;
}

/**
 * navigation モードでのペースト処理。
 * TSV 形式の場合はマルチセル貼り付け、それ以外は選択セルの内容を置換する。
 */
export function handlePaste(
  view: EditorView,
  event: ClipboardEvent,
): boolean {
  const pluginState = tableCellModePluginKey.getState(view.state);
  if (!pluginState) return false;
  if (pluginState.mode !== "navigation" || pluginState.selectedCellPos == null) {
    return false;
  }

  event.preventDefault();
  const plainText = event.clipboardData?.getData("text/plain") ?? "";
  const htmlText = event.clipboardData?.getData("text/html") ?? "";

  const tableData = parseClipboardTable(plainText, htmlText);

  if (tableData) {
    // TSV データのマルチセル貼り付け
    pasteTableData(view, pluginState.selectedCellPos, tableData);
  } else {
    // プレーンテキストで選択セルの内容を置換
    replaceCellContent(view, pluginState.selectedCellPos, plainText);
  }

  return true;
}
