import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  exitTableMode,
  setEditingMode,
  setNavigationMode,
  tableCellModePluginKey,
} from "./tableCellModePlugin";

/**
 * セル位置からテーブルの DOM 要素を取得し、インライン表（width: auto）かどうかを判定する。
 */
export function isInlineTable(view: EditorView, cellPos: number): boolean {
  try {
    const $pos = view.state.doc.resolve(cellPos);
    for (let depth = $pos.depth; depth >= 0; depth--) {
      if ($pos.node(depth).type.name === "table") {
        const tableStart = $pos.before(depth);
        const dom = view.nodeDOM(tableStart);
        if (dom instanceof HTMLElement) {
          const table = dom.tagName === "TABLE" ? dom : dom.querySelector("table");
          if (table) {
            const w = table.style.width;
            return !w || w === "auto";
          }
        }
        break;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * マウス座標からテーブルセルノードの位置を取得する。
 * セル内でない場合は null を返す。
 */
export function findCellPosFromEvent(
  view: EditorView,
  event: MouseEvent,
): number | null {
  const posInfo = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!posInfo) return null;

  const pos = posInfo.inside >= 0 ? posInfo.inside : posInfo.pos;

  try {
    const $pos = view.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (
        node.type.name === "tableCell" ||
        node.type.name === "tableHeader"
      ) {
        return $pos.before(depth);
      }
    }
  } catch {
    // 位置が無効な場合は無視
  }

  return null;
}

/** アクティブなテーブルモード状態があれば終了する */
function exitTableModeIfActive(
  view: EditorView,
  pluginState: ReturnType<typeof tableCellModePluginKey.getState>,
): void {
  const hasActiveState =
    pluginState &&
    (pluginState.selectedCellPos != null ||
      pluginState.editingCellPos != null);
  if (hasActiveState) {
    const { tr } = view.state;
    view.dispatch(exitTableMode(tr));
  }
}

/**
 * mousedown ハンドラ。
 * テーブルセルモードの navigation / editing 切替を制御する。
 */
export function handleMouseDown(
  view: EditorView,
  event: MouseEvent,
): boolean {
  const pluginState = tableCellModePluginKey.getState(view.state);
  const cellPos = findCellPosFromEvent(view, event);

  // テーブル外クリック → アクティブ状態があれば終了
  if (cellPos == null) {
    exitTableModeIfActive(view, pluginState);
    return false;
  }

  // インラインの表 → ProseMirror のデフォルト動作に委譲
  if (isInlineTable(view, cellPos)) {
    exitTableModeIfActive(view, pluginState);
    return false;
  }

  // Shift+クリック → editing 中なら navigation に切替、選択は ProseMirror に委譲
  if (event.shiftKey) {
    if (pluginState?.mode === "editing" && pluginState.editingCellPos != null) {
      const { tr } = view.state;
      view.dispatch(setNavigationMode(tr, pluginState.editingCellPos));
    }
    return false;
  }

  const hasActiveState =
    pluginState &&
    (pluginState.selectedCellPos != null ||
      pluginState.editingCellPos != null);

  // navigation モード → 選択セルを更新
  if (pluginState?.mode === "navigation" && hasActiveState) {
    const { tr } = view.state;
    view.dispatch(setNavigationMode(tr, cellPos));
    event.preventDefault();
    return true;
  }

  // editing モード → 同じセルならデフォルト動作、別セルなら navigation へ
  if (pluginState?.mode === "editing" && pluginState.editingCellPos != null) {
    if (cellPos === pluginState.editingCellPos) {
      return false;
    }
    const { tr } = view.state;
    view.dispatch(setNavigationMode(tr, cellPos));
    event.preventDefault();
    return true;
  }

  // 初回エントリ（アクティブ状態なし）→ navigation モード開始
  const { tr } = view.state;
  view.dispatch(setNavigationMode(tr, cellPos));
  event.preventDefault();
  return true;
}

/**
 * dblclick ハンドラ。
 * navigation モード → editing モードへ遷移しカーソルを配置する。
 */
export function handleDoubleClick(
  view: EditorView,
  event: MouseEvent,
): boolean {
  const pluginState = tableCellModePluginKey.getState(view.state);
  const cellPos = findCellPosFromEvent(view, event);

  if (cellPos == null) {
    return false;
  }

  // インラインの表 → デフォルト動作に委譲
  if (isInlineTable(view, cellPos)) {
    return false;
  }

  // navigation モード → editing モードへ遷移
  if (
    pluginState?.mode === "navigation" &&
    pluginState.selectedCellPos != null
  ) {
    const { tr } = view.state;
    view.dispatch(setEditingMode(tr, cellPos));

    // クリック位置にカーソルを配置
    const posInfo = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (posInfo) {
      const cursorTr = view.state.tr;
      cursorTr.setSelection(
        TextSelection.near(view.state.doc.resolve(posInfo.pos)),
      );
      view.dispatch(cursorTr);
    }
    return true;
  }

  // editing モード → デフォルトの単語選択を許可
  return false;
}
