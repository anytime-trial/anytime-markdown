"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { SpreadsheetGrid, SpreadsheetI18nProvider } from "@anytime-markdown/spreadsheet-viewer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TableChartIcon } from "../ui/icons";
import { Button } from "../ui/Button";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "../ui/Dialog";
import { useIsDark } from "../contexts/ThemeModeContext";
import { useMarkdownT } from "../i18n/context";
import { deleteBlockAt } from "../chrome/blockChrome";
import { createTableBlockChrome, type TableBlockChromeHandle } from "../chrome/tableBlockChrome";
import { createTiptapSheetAdapter } from "../spreadsheet/TiptapSheetAdapter";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";

function getTableGridOptions(editor: Editor) {
  const tableExt = editor.extensionManager.extensions.find((e) => e.name === "table");
  return {
    gridRows: tableExt?.options?.gridRows as number | undefined,
    gridCols: tableExt?.options?.gridCols as number | undefined,
  };
}

/** スプレッドシート編集（SpreadsheetGrid + TiptapSheetAdapter）。pos のテーブルを編集する。 */
function SpreadsheetEditContent({ editor, pos, isDark, onDirtyChange, onClose }: Readonly<{
  editor: Editor; pos: number; isDark: boolean;
  onDirtyChange: (dirty: boolean) => void; onClose: () => void;
}>) {
  const { gridRows, gridCols, adapter } = useMemo(() => {
    const opts = getTableGridOptions(editor);
    return {
      gridRows: opts.gridRows,
      gridCols: opts.gridCols,
      adapter: createTiptapSheetAdapter(
        editor,
        () => {
          const node = editor.state.doc.nodeAt(pos);
          return node?.type.name === "table" ? { node, pos } : null;
        },
        { readOnly: !editor.isEditable },
      ),
    };
  }, [editor, pos]);
  const handleUndo = useCallback(() => { editor.chain().undo().run(); }, [editor]);
  const handleRedo = useCallback(() => { editor.chain().redo().run(); }, [editor]);
  return (
    <SpreadsheetI18nProvider>
      <SpreadsheetGrid
        adapter={adapter}
        isDark={isDark}
        gridRows={gridRows}
        gridCols={gridCols}
        showApply
        showRange
        showHeaderRow
        onDirtyChange={onDirtyChange}
        onClose={onClose}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </SpreadsheetI18nProvider>
  );
}

/**
 * table ブロックのダイアログ host（Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・操作ツールバーは React なしの {@link createTableBlockChrome} が担い、本
 * コンポーネントはスプレッドシート編集ダイアログ・削除/破棄ダイアログ（React・重量 UI）
 * のみを host 側 React として提供する。vanilla chrome の intent（edit / delete）で開閉し、
 * 編集中は `setEditing(true)` でツールバーを抑制する。
 */
export function TableDialogHost({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const [editOpen, setEditOpen] = useState(false);
  const [editPos, setEditPos] = useState(-1);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const deletePosRef = useRef(-1);
  const dirtyRef = useRef(false);
  const chromeRef = useRef<TableBlockChromeHandle | null>(null);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    dirtyRef.current = false;
    chromeRef.current?.setEditing(false);
  }, []);

  const tryClose = useCallback(() => {
    if (dirtyRef.current) setDiscardOpen(true);
    else closeEdit();
  }, [closeEdit]);

  useEffect(() => {
    if (!editor) return;
    const handle = createTableBlockChrome(editor, {
      t,
      onEdit: (pos) => {
        setEditPos(pos);
        setEditOpen(true);
        handle.setEditing(true);
      },
      onDelete: (pos) => {
        deletePosRef.current = pos;
        setDeleteOpen(true);
      },
    });
    chromeRef.current = handle;
    return () => {
      chromeRef.current = null;
      handle.destroy();
    };
  }, [editor, t]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    closeEdit();
  }, [closeEdit]);

  const handleDelete = useCallback(() => {
    if (editor) deleteBlockAt(editor, deletePosRef.current);
    setDeleteOpen(false);
  }, [editor]);

  return (
    <>
      {editOpen && editor && editPos >= 0 && (
        <EditDialogWrapper open={editOpen} onClose={tryClose} ariaLabelledBy="table-edit-title">
          <div contentEditable={false}>
            <EditDialogHeader
              label={t("tableLabel")}
              onClose={tryClose}
              icon={<TableChartIcon fontSize={18} />}
              t={t}
            />
          </div>
          <SpreadsheetEditContent
            editor={editor}
            pos={editPos}
            isDark={isDark}
            onDirtyChange={handleDirtyChange}
            onClose={tryClose}
          />
        </EditDialogWrapper>
      )}

      <DeleteBlockDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDelete={handleDelete}
        t={t}
      />

      {discardOpen && (
        <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)}>
          <DialogTitle>{t("spreadsheetDiscardTitle")}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t("spreadsheetDiscardMessage")}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDiscardOpen(false)}>{t("cancel")}</Button>
            <Button onClick={confirmDiscard} color="error">{t("discard")}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
