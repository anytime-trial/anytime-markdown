import { mountSpreadsheetGrid } from "@anytime-markdown/spreadsheet-viewer";
import type { Editor } from "@anytime-markdown/markdown-core";

import { createTiptapSheetAdapter } from "../spreadsheet/TiptapSheetAdapter";
import type { TranslationFn } from "../types";
import { createDialog, nextDialogTitleId } from "../ui-vanilla/Dialog";
import { confirmWithDialog } from "../ui-vanilla/confirmDialog";
import { createIconButton } from "../ui-vanilla/IconButton";

/**
 * 表の全画面スプレッドシート編集ダイアログ（旧 React TableDialogHost の vanilla 版）。
 *
 * G4 で TableDialogHost（SpreadsheetGrid + TiptapSheetAdapter）が削除され
 * テーブルツールバーの編集ボタンが no-op になっていた回帰の復元。
 * spreadsheet-viewer の脱 React により、React 非依存の mountSpreadsheetGrid で
 * 同等機能（グリッド編集・適用・dirty 時の破棄確認）を提供する。
 */

export interface OpenTableEditDialogOptions {
  editor: Editor;
  /** 編集対象 table ノードの位置。 */
  pos: number;
  isDark: boolean;
  /** ダイアログ chrome（タイトル・破棄確認）用の MarkdownEditor namespace t。 */
  t: TranslationFn;
  /**
   * グリッド内部ラベル（spreadsheet-viewer 自前 i18n）解決用ロケール。
   * 未指定時は navigator.language（旧 SpreadsheetI18nProvider の自動検出と同じ）。
   */
  locale?: string;
  /** ダイアログの紙背景（旧 getEditDialogBg 相当）。未指定時はテーマ既定。 */
  paperBg?: string;
  /** 閉じた後に呼ばれる（chrome の setEditing(false) 等）。 */
  onClosed: () => void;
}

export interface TableEditDialogHandle {
  /** dirty 確認なしで強制クローズする（destroy 時用）。 */
  destroy(): void;
}

function getTableGridOptions(editor: Editor): { gridRows?: number; gridCols?: number } {
  const tableExt = editor.extensionManager.extensions.find((e) => e.name === "table");
  return {
    gridRows: tableExt?.options?.gridRows as number | undefined,
    gridCols: tableExt?.options?.gridCols as number | undefined,
  };
}

export function openTableEditDialog(options: OpenTableEditDialogOptions): TableEditDialogHandle {
  const { editor, pos, isDark, t } = options;
  let dirty = false;
  let closed = false;

  const adapter = createTiptapSheetAdapter(
    editor,
    () => {
      const node = editor.state.doc.nodeAt(pos);
      return node?.type.name === "table" ? { node, pos } : null;
    },
    { readOnly: !editor.isEditable },
  );

  const titleId = nextDialogTitleId();

  const close = (): void => {
    if (closed) return;
    closed = true;
    grid.destroy();
    dlg.destroy();
    options.onClosed();
  };

  const tryClose = (): void => {
    if (closed) return;
    if (!dirty) {
      close();
      return;
    }
    void confirmWithDialog({
      title: t("spreadsheetDiscardTitle"),
      message: t("spreadsheetDiscardMessage"),
      confirmLabel: t("spreadsheetDiscardConfirm"),
      cancelLabel: t("spreadsheetDiscardCancel"),
    }).then((ok) => {
      if (ok) close();
    });
  };

  const dlg = createDialog({
    onClose: tryClose,
    fullScreen: true,
    labelledBy: titleId,
    ...(options.paperBg ? { paperStyle: { backgroundColor: options.paperBg } } : {}),
  });

  // ヘッダー（閉じる + ラベル）。旧 EditDialogHeader の最小 vanilla 版。
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:4px 8px;flex-shrink:0;" +
    "border-bottom:1px solid var(--am-color-divider);";
  const closeBtn = createIconButton({
    size: "small",
    ariaLabel: t("close"),
    title: t("close"),
    children: "✕",
    onClick: tryClose,
  });
  const label = document.createElement("span");
  label.id = titleId;
  label.textContent = t("tableLabel");
  label.style.cssText = "font-weight:600;font-size:0.875rem;";
  header.append(closeBtn.el, label);
  dlg.paper.appendChild(header);

  // グリッド本体（旧 SpreadsheetEditContent と同オプション）。
  const gridWrap = document.createElement("div");
  gridWrap.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;";
  dlg.paper.appendChild(gridWrap);

  const { gridRows, gridCols } = getTableGridOptions(editor);
  const grid = mountSpreadsheetGrid(gridWrap, {
    adapter,
    isDark,
    gridRows,
    gridCols,
    showApply: true,
    showRange: true,
    showHeaderRow: true,
    locale: options.locale,
    onDirtyChange: (next) => {
      dirty = next;
    },
    onClose: tryClose,
    onUndo: () => {
      editor.chain().undo().run();
    },
    onRedo: () => {
      editor.chain().redo().run();
    },
  });

  return {
    destroy: close,
  };
}
