import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { handleCopy, handleCut, handlePaste } from "./tableCellModeClipboard";
import { handleKeyDown } from "./tableCellModeKeymap";
import { handleDoubleClick,handleMouseDown } from "./tableCellModeMouse";
import { CELL_EDITING,CELL_NAV_SELECTED } from "./tableCellModeStyles";
import {
  INITIAL_STATE,
  type TableCellModeState,
} from "./tableCellModeTypes";

/** Plugin の PluginKey */
export const tableCellModePluginKey = new PluginKey<TableCellModeState>(
  "tableCellMode",
);

const META_KEY = "tableCellMode";

// ----------------------------------------------------------------
// Transaction ヘルパー
// ----------------------------------------------------------------

/** navigation モードに設定し、選択セル位置を記録する。
 *  同時にセル内先頭にTextSelectionを配置し、旧カーソルを消す。 */
export function setNavigationMode(tr: Transaction, cellPos: number): Transaction {
  tr.setMeta(META_KEY, {
    mode: "navigation",
    selectedCellPos: cellPos,
    editingCellPos: null,
  } satisfies TableCellModeState);
  // セル内先頭に TextSelection を移動（caret-color: transparent で非表示になる）
  try {
    const cell = tr.doc.nodeAt(cellPos);
    if (cell) {
      const insidePos = cellPos + 1; // セルノード直下（paragraph の開始）
      tr.setSelection(TextSelection.near(tr.doc.resolve(insidePos)));
    }
  } catch {
    // 位置が無効な場合は無視
  }
  return tr;
}

/** editing モードに設定し、編集中セル位置を記録する */
export function setEditingMode(tr: Transaction, cellPos: number): Transaction {
  return tr.setMeta(META_KEY, {
    mode: "editing",
    selectedCellPos: null,
    editingCellPos: cellPos,
  } satisfies TableCellModeState);
}

/** テーブルモードを終了し初期状態に戻す */
export function exitTableMode(tr: Transaction): Transaction {
  return tr.setMeta(META_KEY, INITIAL_STATE);
}

// ----------------------------------------------------------------
// Decoration 生成
// ----------------------------------------------------------------

function buildDecorations(
  state: TableCellModeState,
  doc: import("@tiptap/pm/model").Node,
): DecorationSet {
  const decos: Decoration[] = [];

  const targetPos =
    state.mode === "navigation"
      ? state.selectedCellPos
      : state.editingCellPos;

  if (targetPos == null) {
    return DecorationSet.empty;
  }

  const cssClass =
    state.mode === "navigation" ? CELL_NAV_SELECTED : CELL_EDITING;

  // targetPos はセルノードの開始位置を指す
  try {
    const node = doc.nodeAt(targetPos);
    if (node && (node.type.name === "tableCell" || node.type.name === "tableHeader")) {
      decos.push(
        Decoration.node(targetPos, targetPos + node.nodeSize, {
          class: cssClass,
        }),
      );
    }
  } catch {
    // 位置が無効な場合は無視
  }

  return DecorationSet.create(doc, decos);
}

// ----------------------------------------------------------------
// Plugin 本体
// ----------------------------------------------------------------

export function tableCellModePlugin(): Plugin<TableCellModeState> {
  return new Plugin<TableCellModeState>({
    key: tableCellModePluginKey,

    state: {
      init(): TableCellModeState {
        return INITIAL_STATE;
      },

      apply(tr, value): TableCellModeState {
        // meta が設定されていればそれを採用
        const meta = tr.getMeta(META_KEY) as TableCellModeState | undefined;
        if (meta) {
          return meta;
        }

        // ドキュメントが変更された場合は位置をマッピング
        if (tr.docChanged) {
          const mapped = mapPositions(value, tr);
          return mapped;
        }

        return value;
      },
    },

    props: {
      handleKeyDown: (view, event) => handleKeyDown(view, event),
      handleDOMEvents: {
        mousedown: (view, event) => handleMouseDown(view, event),
        dblclick: (view, event) => handleDoubleClick(view, event),
        copy: (view, event) => handleCopy(view, event),
        cut: (view, event) => handleCut(view, event),
        paste: (view, event) => handlePaste(view, event),
      },
      decorations(state) {
        const pluginState = tableCellModePluginKey.getState(state);
        if (!pluginState) {
          return DecorationSet.empty;
        }
        return buildDecorations(pluginState, state.doc);
      },
    },
  });
}

/** ドキュメント変更時に位置をマッピングする */
function mapPositions(
  value: TableCellModeState,
  tr: Transaction,
): TableCellModeState {
  const { selectedCellPos, editingCellPos } = value;

  if (selectedCellPos == null && editingCellPos == null) {
    return value;
  }

  const mappedSelected =
    selectedCellPos == null ? null : tr.mapping.map(selectedCellPos);
  const mappedEditing =
    editingCellPos == null ? null : tr.mapping.map(editingCellPos);

  // マッピング後の位置が有効なセルノードか検証
  const validSelected = mappedSelected == null
    ? null
    : validateCellPos(tr.doc, mappedSelected);
  const validEditing = mappedEditing == null
    ? null
    : validateCellPos(tr.doc, mappedEditing);

  // 位置が無効になった場合は初期状態に戻す
  if (
    (selectedCellPos != null && validSelected == null) ||
    (editingCellPos != null && validEditing == null)
  ) {
    return INITIAL_STATE;
  }

  if (validSelected === selectedCellPos && validEditing === editingCellPos) {
    return value;
  }

  return {
    mode: value.mode,
    selectedCellPos: validSelected,
    editingCellPos: validEditing,
  };
}

/** 位置がテーブルセルノードを指しているか検証する */
function validateCellPos(
  doc: import("@tiptap/pm/model").Node,
  pos: number,
): number | null {
  try {
    const node = doc.nodeAt(pos);
    if (node && (node.type.name === "tableCell" || node.type.name === "tableHeader")) {
      return pos;
    }
  } catch {
    // 範囲外
  }
  return null;
}
