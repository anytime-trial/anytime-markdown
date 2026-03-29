import type { EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";
import { TableMap } from "prosemirror-tables";
import {
  tableCellModePluginKey,
  setNavigationMode,
  setEditingMode,
  exitTableMode,
} from "./tableCellModePlugin";

// ----------------------------------------------------------------
// Helper functions
// ----------------------------------------------------------------

/** 非修飾キーの一覧（印字不可能キー） */
const NON_PRINTABLE_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Pause",
  "PrintScreen",
  "ContextMenu",
  "Unidentified",
  "Process",
  "Dead",
  "Compose",
]);

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
]);

/**
 * 印字可能文字かどうかを判定する。
 * 修飾キー、特殊キー、ファンクションキーは false を返す。
 */
export function isPrintableKey(key: string): boolean {
  if (key.length === 0) return false;
  if (MODIFIER_KEYS.has(key)) return false;
  if (NON_PRINTABLE_KEYS.has(key)) return false;
  // ファンクションキー: F1〜F24
  if (/^F\d{1,2}$/.test(key)) return false;
  return true;
}

/** 修飾キーのみかどうかを判定する */
export function isModifierOnly(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

// ----------------------------------------------------------------
// Cell navigation helpers
// ----------------------------------------------------------------

/**
 * 隣接セルの位置を取得する。
 * TableMap を使って行列を計算し、指定方向のセル位置を返す。
 */
export function getAdjacentCellPos(
  view: EditorView,
  cellPos: number,
  direction: "up" | "down" | "left" | "right",
): number | null {
  const { doc } = view.state;
  try {
    const $pos = doc.resolve(cellPos);
    // テーブルノードを探す
    let tableNode = null;
    let tableStart = 0;
    for (let depth = $pos.depth; depth >= 0; depth--) {
      if ($pos.node(depth).type.name === "table") {
        tableNode = $pos.node(depth);
        tableStart = $pos.before(depth) + 1;
        break;
      }
    }
    if (!tableNode) return null;

    const map = TableMap.get(tableNode);
    const cellOffset = cellPos - tableStart;
    const cellIndex = map.map.indexOf(cellOffset);
    if (cellIndex === -1) return null;

    const col = cellIndex % map.width;
    const row = Math.floor(cellIndex / map.width);

    let targetRow = row;
    let targetCol = col;
    switch (direction) {
      case "up":
        targetRow--;
        break;
      case "down":
        targetRow++;
        break;
      case "left":
        targetCol--;
        break;
      case "right":
        targetCol++;
        break;
    }

    if (targetRow < 0 || targetRow >= map.height) return null;
    if (targetCol < 0 || targetCol >= map.width) return null;

    return tableStart + map.map[targetRow * map.width + targetCol];
  } catch {
    return null;
  }
}

/** セル内容をクリアし、空の paragraph で置換する */
export function clearCellContent(view: EditorView, cellPos: number): void {
  const { doc, schema } = view.state;
  const cell = doc.nodeAt(cellPos);
  if (!cell) return;
  const from = cellPos + 1;
  const to = cellPos + cell.nodeSize - 1;
  if (from < to) {
    const { tr } = view.state;
    tr.replaceWith(from, to, schema.nodes.paragraph.create());
    view.dispatch(tr);
  }
}

/** セル末尾にカーソルを配置する */
export function placeCursorAtCellEnd(
  view: EditorView,
  cellPos: number,
): void {
  const cell = view.state.doc.nodeAt(cellPos);
  if (!cell) return;
  const endPos = cellPos + cell.nodeSize - 2;
  const { tr } = view.state;
  tr.setSelection(TextSelection.create(view.state.doc, endPos));
  view.dispatch(tr);
}

// ----------------------------------------------------------------
// クリップボード判定
// ----------------------------------------------------------------

function isClipboardShortcut(event: KeyboardEvent): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return false;
  const key = event.key.toLowerCase();
  return key === "c" || key === "x" || key === "v";
}

// ----------------------------------------------------------------
// Navigation mode handler
// ----------------------------------------------------------------

/**
 * navigation モードのキーボードイベントハンドラ。
 * @returns true でイベントを消費、false で ProseMirror に委譲
 */
export function handleNavigationKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  cellPos: number,
): boolean {
  const { key } = event;

  // Shift+Arrow → CellSelection に委譲
  if (
    event.shiftKey &&
    (key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight")
  ) {
    return false;
  }

  // Arrow keys → 隣接セルへ移動
  if (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  ) {
    const direction = key.replace("Arrow", "").toLowerCase() as
      | "up"
      | "down"
      | "left"
      | "right";
    const nextPos = getAdjacentCellPos(view, cellPos, direction);
    if (nextPos != null) {
      const { tr } = view.state;
      view.dispatch(setNavigationMode(tr, nextPos));
    }
    return true;
  }

  // Tab / Shift+Tab → 次/前のセルへ移動
  if (key === "Tab") {
    const direction = event.shiftKey ? "left" : "right";
    const nextPos = getAdjacentCellPos(view, cellPos, direction);
    if (nextPos != null) {
      const { tr } = view.state;
      view.dispatch(setNavigationMode(tr, nextPos));
    }
    return true;
  }

  // Enter / F2 → editing モードに遷移
  if (key === "Enter" || key === "F2") {
    const { tr } = view.state;
    view.dispatch(setEditingMode(tr, cellPos));
    placeCursorAtCellEnd(view, cellPos);
    return true;
  }

  // Escape → テーブルモード終了
  if (key === "Escape") {
    const { tr } = view.state;
    view.dispatch(exitTableMode(tr));
    return true;
  }

  // Delete / Backspace → セル内容クリア
  if (key === "Delete" || key === "Backspace") {
    clearCellContent(view, cellPos);
    return true;
  }

  // Ctrl/Cmd+C/X/V → クリップボードに委譲
  if (isClipboardShortcut(event)) {
    return false;
  }

  // 修飾キー単体 → 無視
  if (isModifierOnly(key)) {
    return false;
  }

  // 印字可能文字（Ctrl/Meta/Alt なし） → editing モードに遷移して文字入力を許可
  if (isPrintableKey(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const { tr } = view.state;
    view.dispatch(setEditingMode(tr, cellPos));
    placeCursorAtCellEnd(view, cellPos);
    return false;
  }

  // その他 → 消費
  event.preventDefault();
  return true;
}

// ----------------------------------------------------------------
// Editing mode handler
// ----------------------------------------------------------------

/**
 * editing モードのキーボードイベントハンドラ。
 * @returns true でイベントを消費、false で ProseMirror に委譲
 */
export function handleEditingKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  cellPos: number,
): boolean {
  const { key } = event;

  // Enter（Shift なし） → 確定して下のセルへ（navigation）
  if (key === "Enter" && !event.shiftKey) {
    const nextPos = getAdjacentCellPos(view, cellPos, "down");
    const targetPos = nextPos ?? cellPos;
    const { tr } = view.state;
    view.dispatch(setNavigationMode(tr, targetPos));
    return true;
  }

  // Shift+Enter → 改行を許可
  if (key === "Enter" && event.shiftKey) {
    return false;
  }

  // Tab → 確定して次/前のセルへ（navigation）
  if (key === "Tab") {
    const direction = event.shiftKey ? "left" : "right";
    const nextPos = getAdjacentCellPos(view, cellPos, direction);
    const targetPos = nextPos ?? cellPos;
    const { tr } = view.state;
    view.dispatch(setNavigationMode(tr, targetPos));
    return true;
  }

  // Escape → キャンセルして同じセルの navigation に戻る
  if (key === "Escape") {
    const { tr } = view.state;
    view.dispatch(setNavigationMode(tr, cellPos));
    return true;
  }

  // F2 → navigation に戻る
  if (key === "F2") {
    const { tr } = view.state;
    view.dispatch(setNavigationMode(tr, cellPos));
    return true;
  }

  // その他 → ProseMirror に委譲
  return false;
}

// ----------------------------------------------------------------
// Unified entry point
// ----------------------------------------------------------------

/**
 * プラグインの handleKeyDown エントリーポイント。
 * プラグイン状態を参照し、適切なモードハンドラに委譲する。
 */
export function handleKeyDown(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  const pluginState = tableCellModePluginKey.getState(view.state);
  if (!pluginState) return false;

  if (
    pluginState.mode === "navigation" &&
    pluginState.selectedCellPos != null
  ) {
    return handleNavigationKeyDown(view, event, pluginState.selectedCellPos);
  }

  if (pluginState.mode === "editing" && pluginState.editingCellPos != null) {
    return handleEditingKeyDown(view, event, pluginState.editingCellPos);
  }

  return false;
}
