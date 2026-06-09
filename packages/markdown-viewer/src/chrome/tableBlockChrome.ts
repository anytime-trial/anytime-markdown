import type { Editor } from "@anytime-markdown/markdown-core";

import { moveTableColumn, moveTableRow } from "../utils/tableHelpers";
import { createBlockChromeAnchor, createSelectedBlockTracker } from "./blockChrome";
import {
  ICON,
  createToolbarContainer,
  mkButtonGroup,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
} from "./vanillaToolbar";

/**
 * table ブロックの編集 chrome を **React なし**で提供する vanilla コントローラ
 * （Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・配置・操作ツールバー（列/行の追加削除・整列・移動）を素 DOM で構成し、
 * 列/行操作は editor コマンドへ直接発火する。スプレッドシート編集ダイアログ
 * （SpreadsheetGrid・React）と削除確認は host（{@link TableDialogHost}）が intent を
 * 受けて表示する。スプレッドシート編集中はツールバーを抑制する（`setEditing(true)`）。
 */

/** 列/行操作・整列・移動の vanilla ops ツールバー（旧 React TableOperationsToolbar 等価）。 */
function buildOpsToolbar(editor: Editor, t: (k: string) => string): HTMLElement {
  const ops = document.createElement("div");
  ops.style.cssText = "display:inline-flex;align-items:center;gap:4px;";

  const cols = mkButtonGroup(
    mkIconButton(t("addColumn"), ICON.viewColumn, () => editor.chain().focus().addColumnAfter().run(), { badge: "+" }),
    mkIconButton(t("removeColumn"), ICON.viewColumn, () => editor.chain().focus().deleteColumn().run(), { badge: "x", badgeError: true }),
  );
  const rows = mkButtonGroup(
    mkIconButton(t("addRow"), ICON.tableRows, () => editor.chain().focus().addRowAfter().run(), { badge: "+" }),
    mkIconButton(t("removeRow"), ICON.tableRows, () => editor.chain().focus().deleteRow().run(), { badge: "x", badgeError: true }),
  );
  const align = mkButtonGroup(
    mkIconButton(t("alignLeft"), ICON.alignLeft, () => editor.chain().focus().setCellAttribute("textAlign", "left").run()),
    mkIconButton(t("alignCenter"), ICON.alignCenter, () => editor.chain().focus().setCellAttribute("textAlign", "center").run()),
    mkIconButton(t("alignRight"), ICON.alignRight, () => editor.chain().focus().setCellAttribute("textAlign", "right").run()),
  );
  const moveRow = mkButtonGroup(
    mkIconButton(t("moveRowUp"), ICON.moveUp, () => moveTableRow(editor, "up")),
    mkIconButton(t("moveRowDown"), ICON.moveDown, () => moveTableRow(editor, "down")),
  );
  const moveCol = mkButtonGroup(
    mkIconButton(t("moveColLeft"), ICON.moveUp, () => moveTableColumn(editor, "left"), { rotate: -90 }),
    mkIconButton(t("moveColRight"), ICON.moveDown, () => moveTableColumn(editor, "right"), { rotate: -90 }),
  );

  ops.append(cols, rows, align, moveRow, moveCol);
  return ops;
}

export interface TableBlockChromeCallbacks {
  t: (key: string) => string;
  /** スプレッドシート編集 intent（host がダイアログを開く）。 */
  onEdit: (pos: number) => void;
  /** 削除 intent（host が確認ダイアログを開く）。 */
  onDelete: (pos: number) => void;
}

export interface TableBlockChromeHandle {
  /** スプレッドシート編集中のツールバー抑制を切り替える。 */
  setEditing(editing: boolean): void;
  destroy(): void;
}

/**
 * table ブロックの vanilla chrome を生成する。
 */
export function createTableBlockChrome(
  editor: Editor,
  cb: TableBlockChromeCallbacks,
): TableBlockChromeHandle {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;
  let currentRect: DOMRect | null = null;
  let editing = false;

  const applyVisibility = (): void => {
    anchor.setRect(editor.isEditable && currentPos >= 0 && !editing ? currentRect : null);
  };

  const toolbar = createToolbarContainer(cb.t("tableLabel"));
  const editBtn = mkIconButton(cb.t("edit"), ICON.edit, () => {
    if (currentPos >= 0) cb.onEdit(currentPos);
  });
  const deleteBtn = mkIconButton(cb.t("delete"), ICON.delete, () => {
    if (currentPos >= 0) cb.onDelete(currentPos);
  });
  toolbar.append(
    mkDragHandle(cb.t("dragHandle")),
    mkLabel(cb.t("tableLabel")),
    editBtn,
    buildOpsToolbar(editor, cb.t),
    mkSpacer(),
    deleteBtn,
  );
  anchor.el.appendChild(toolbar);

  const stop = createSelectedBlockTracker(editor, "table", ({ pos, rect }) => {
    currentPos = pos;
    currentRect = rect;
    applyVisibility();
  });

  return {
    setEditing(next) {
      editing = next;
      applyVisibility();
    },
    destroy() {
      stop();
      anchor.destroy();
    },
  };
}
