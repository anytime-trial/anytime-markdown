"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { SpreadsheetGrid, SpreadsheetI18nProvider } from "@anytime-markdown/spreadsheet-viewer";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  FormatAlignCenterIcon,
  FormatAlignLeftIcon,
  FormatAlignRightIcon,
  MoveDownIcon,
  MoveUpIcon,
  TableChartIcon,
  TableRowsIcon,
  ViewColumnIcon,
} from "../ui/icons";
import { getErrorMain } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { useMarkdownT } from "../i18n/context";
import { useSelectedBlock } from "../hooks/useSelectedBlock";
import { createTiptapSheetAdapter } from "../spreadsheet/TiptapSheetAdapter";
import { moveTableColumn, moveTableRow } from "../utils/tableHelpers";
import { Button } from "../ui/Button";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "../ui/Dialog";
import { Divider } from "../ui/Divider";
import { ToggleButton } from "../ui/ToggleButton";
import { ToggleButtonGroup } from "../ui/ToggleButtonGroup";
import { Tooltip } from "../ui/Tooltip";
import { BlockChromeAnchor } from "./BlockChromeAnchor";
import { BlockInlineToolbar } from "./codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import styles from "./TableBlockOverlay.module.css";

const iconSx = { fontSize: 16 };

/** 列/行の追加削除・整列・移動を行う table 操作ツールバー（旧 TableNodeView から移植）。 */
function TableOperationsToolbar({ editor, isDark, t }: Readonly<{ editor: Editor; isDark: boolean; t: (key: string) => string }>) {
  return (
    <div className={styles.opsToolbar}>
      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="addCol" aria-label={t("addColumn")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <Tooltip title={t("addColumn")} placement="top">
            <span className={styles.iconBadgeWrapper}><ViewColumnIcon {...iconSx} /><span className={styles.iconBadge}>+</span></span>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="removeCol" aria-label={t("removeColumn")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().deleteColumn().run()}>
          <Tooltip title={t("removeColumn")} placement="top">
            <span className={styles.iconBadgeWrapper}><ViewColumnIcon {...iconSx} /><span className={styles.iconBadge} style={{ color: getErrorMain(isDark) }}>x</span></span>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="addRow" aria-label={t("addRow")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().addRowAfter().run()}>
          <Tooltip title={t("addRow")} placement="top">
            <span className={styles.iconBadgeWrapper}><TableRowsIcon {...iconSx} /><span className={styles.iconBadge}>+</span></span>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="removeRow" aria-label={t("removeRow")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().deleteRow().run()}>
          <Tooltip title={t("removeRow")} placement="top">
            <span className={styles.iconBadgeWrapper}><TableRowsIcon {...iconSx} /><span className={styles.iconBadge} style={{ color: getErrorMain(isDark) }}>x</span></span>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup exclusive size="small" className={styles.toggleGroup24}
        onChange={(_e, val) => { if (val) editor.chain().focus().setCellAttribute("textAlign", val).run(); }}>
        <ToggleButton value="left" aria-label={t("alignLeft")} className={styles.toggleBtnCompact}>
          <Tooltip title={t("alignLeft")} placement="top"><FormatAlignLeftIcon {...iconSx} /></Tooltip>
        </ToggleButton>
        <ToggleButton value="center" aria-label={t("alignCenter")} className={styles.toggleBtnCompact}>
          <Tooltip title={t("alignCenter")} placement="top"><FormatAlignCenterIcon {...iconSx} /></Tooltip>
        </ToggleButton>
        <ToggleButton value="right" aria-label={t("alignRight")} className={styles.toggleBtnCompact}>
          <Tooltip title={t("alignRight")} placement="top"><FormatAlignRightIcon {...iconSx} /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="rowUp" aria-label={t("moveRowUp")} className={styles.toggleBtnCompact} onClick={() => moveTableRow(editor, "up")}>
          <Tooltip title={t("moveRowUp")} placement="top"><MoveUpIcon {...iconSx} /></Tooltip>
        </ToggleButton>
        <ToggleButton value="rowDown" aria-label={t("moveRowDown")} className={styles.toggleBtnCompact} onClick={() => moveTableRow(editor, "down")}>
          <Tooltip title={t("moveRowDown")} placement="top"><MoveDownIcon {...iconSx} /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="colLeft" aria-label={t("moveColLeft")} className={styles.toggleBtnCompact} onClick={() => moveTableColumn(editor, "left")}>
          <Tooltip title={t("moveColLeft")} placement="top"><MoveUpIcon {...iconSx} style={{ transform: "rotate(-90deg)" }} /></Tooltip>
        </ToggleButton>
        <ToggleButton value="colRight" aria-label={t("moveColRight")} className={styles.toggleBtnCompact} onClick={() => moveTableColumn(editor, "right")}>
          <Tooltip title={t("moveColRight")} placement="top"><MoveDownIcon {...iconSx} style={{ transform: "rotate(-90deg)" }} /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
}

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
  const { gridRows, gridCols } = getTableGridOptions(editor);
  const adapter = useMemo(
    () =>
      createTiptapSheetAdapter(
        editor,
        () => {
          const node = editor.state.doc.nodeAt(pos);
          return node?.type.name === "table" ? { node, pos } : null;
        },
        { readOnly: !editor.isEditable },
      ),
    [editor, pos],
  );
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
 * table ブロックの編集 chrome をページ層で提供する選択駆動オーバーレイ（React）。
 *
 * framework-decoupling Phase 2「反転」設計。content（セル編集・列リサイズ）は基底
 * tiptap Table の native `TableView` が担い、本コンポーネントが選択中 table に対し
 * 操作ツールバーとスプレッドシート編集モードを供給する。選択検出（セル内 TextSelection を
 * 内包する table 祖先）・位置計測・削除は {@link useSelectedBlock} に委譲する。
 *
 * PoC スコープ: 単一エディタ・編集モード。compare/merge 差分表示・collapsed・検索置換は
 * 横展開時に補完する（TODO）。
 */
export function TableBlockOverlay({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const { pos, node, rect, deleteBlock } = useSelectedBlock(editor, "table");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirtyRef = useRef(false);

  const handleDelete = useCallback(() => {
    deleteBlock();
    setDeleteOpen(false);
  }, [deleteBlock]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const tryClose = useCallback(() => {
    if (dirtyRef.current) setDiscardOpen(true);
    else setEditOpen(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    dirtyRef.current = false;
    setEditOpen(false);
  }, []);

  const showToolbar = !!editor && !!node && editor.isEditable && !editOpen;

  return (
    <>
      {showToolbar && (
        <BlockChromeAnchor rect={rect}>
          <BlockInlineToolbar
            label={t("tableLabel")}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            extra={editor ? <TableOperationsToolbar editor={editor} isDark={isDark} t={t} /> : null}
            t={t}
          />
        </BlockChromeAnchor>
      )}

      {editOpen && editor && pos >= 0 && (
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
            pos={pos}
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
