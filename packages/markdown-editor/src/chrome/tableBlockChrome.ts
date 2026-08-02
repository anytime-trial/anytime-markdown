import type { Editor } from "@anytime-markdown/markdown-core";

import { createBlockChromeAnchor, createSelectedBlockTracker } from "./blockChrome";
import {
  ICON,
  createToolbarContainer,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
} from "./vanillaToolbar";

/**
 * table ブロックの編集 chrome を **React なし**で提供する vanilla コントローラ
 * （Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・配置と、編集（スプレッドシート起動）／削除のインライン intent を素 DOM で構成する。
 * 列/行の追加削除・整列・入れ替えはインラインツールバーから撤去し、全画面スプレッドシート
 * 編集ダイアログ（{@link openTableEditDialog} → SpreadsheetGrid）側の行/列ヘッダー右クリック
 * メニュー・整列ツールバーへ集約した（インラインの過密解消）。削除確認は host が intent を
 * 受けて表示する。スプレッドシート編集中はツールバーを抑制する（`setEditing(true)`）。
 */

export interface TableBlockChromeCallbacks {
  t: (key: string) => string;
  /** スプレッドシート編集 intent（host がダイアログを開く）。未指定時は編集ボタン自体を出さない。 */
  onEdit?: (pos: number) => void;
  /** 削除 intent（host が確認ダイアログを開く）。 */
  onDelete: (pos: number) => void;
}

interface TableBlockChromeHandle {
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
  const onEdit = cb.onEdit;
  // 編集ハンドラ未提供時は「押しても何も起きないボタン」を出さない（G4 回帰の再発防止）。
  const editBtn = onEdit
    ? mkIconButton(cb.t("edit"), ICON.edit, () => {
        if (currentPos >= 0) onEdit(currentPos);
      })
    : null;
  const deleteBtn = mkIconButton(cb.t("delete"), ICON.delete, () => {
    if (currentPos >= 0) cb.onDelete(currentPos);
  });
  toolbar.append(
    mkDragHandle(cb.t("dragHandle")),
    mkLabel(cb.t("tableLabel")),
    ...(editBtn ? [editBtn] : []),
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
