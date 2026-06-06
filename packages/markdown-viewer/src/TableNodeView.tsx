"use client";

import { SpreadsheetGrid, SpreadsheetI18nProvider } from "@anytime-markdown/spreadsheet-viewer";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import MoveDownIcon from "@mui/icons-material/MoveDown";
import MoveUpIcon from "@mui/icons-material/MoveUp";
import TableChartIcon from "@mui/icons-material/TableChart";
import TableRowsIcon from "@mui/icons-material/TableRows";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Tooltip, useTheme } from "@mui/material";
import { Button } from "./ui/Button";
import { ToggleButton } from "./ui/ToggleButton";
import { ToggleButtonGroup } from "./ui/ToggleButtonGroup";
import type { Fragment } from "@anytime-markdown/markdown-pm/model";
import type { Editor, NodeViewProps } from "@anytime-markdown/markdown-react";
import { NodeViewContent, NodeViewWrapper } from "@anytime-markdown/markdown-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { BlockInlineToolbar } from "./components/codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./components/codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./components/EditDialogHeader";
import { SearchReplaceBar } from "./components/SearchReplaceBar";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionSelected, getErrorMain, getTextSecondary } from "./constants/colors";
import { SMALL_CAPTION_FONT_SIZE } from "./constants/dimensions";
import { Z_FULLSCREEN } from "./constants/zIndex";
import { findCounterpartTableHtml, getMergeEditors } from "./contexts/MergeEditorsContext";
import { useBlockNodeState } from "./hooks/useBlockNodeState";
import { useMarkdownT } from "./i18n/context";
import { createTiptapSheetAdapter } from "./spreadsheet/TiptapSheetAdapter";
import { Divider } from "./ui/Divider";
import { Paper } from "./ui/Paper";
import { Text } from "./ui/Text";
import { useEditorSettingsContext } from "./useEditorSettings";
import { moveTableColumn, moveTableRow } from "./utils/tableHelpers";
import styles from "./TableNodeView.module.css";

const iconSx = { fontSize: 16 };

// --- Extracted: build highlighted compare HTML ---
function buildHighlightedCompareHtml(
  compareTableHtml: string,
  nodeContent: Fragment,
  tableWidth: string,
): string {
  const currentCells: string[][] = [];
  nodeContent.forEach((row) => {
    const cells: string[] = [];
    row.content.forEach((cell) => { cells.push(cell.textContent); });
    currentCells.push(cells);
  });
  const parser = new DOMParser();
  const doc = parser.parseFromString(compareTableHtml, "text/html");
  const table = doc.querySelector("table");
  if (table) {
    table.style.width = tableWidth;
    table.style.borderCollapse = "collapse";
  }
  const trs = doc.querySelectorAll("tr");
  trs.forEach((tr, rowIdx) => {
    const cells = tr.querySelectorAll("th, td");
    cells.forEach((cell, colIdx) => {
      const currentText = currentCells[rowIdx]?.[colIdx];
      const compareText = (cell as HTMLElement).textContent ?? "";
      if (currentText !== undefined && currentText !== compareText) {
        (cell as HTMLElement).style.backgroundColor = "rgba(46, 160, 67, 0.18)";
      }
    });
  });
  return doc.body.innerHTML;
}

// --- Extracted sub-component: Table operations toolbar ---
function TableOperationsToolbar({ editor, isDark, t }: Readonly<{ editor: Editor; isDark: boolean; t: (key: string) => string }>) {
  return (
    <div className={styles.opsToolbar}>
      {/* Column add/remove */}
      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="addCol" aria-label={t("addColumn")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <Tooltip title={t("addColumn")} placement="top">
            <span className={styles.iconBadgeWrapper}>
              <ViewColumnIcon sx={iconSx} />
              <span className={styles.iconBadge}>+</span>
            </span>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="removeCol" aria-label={t("removeColumn")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().deleteColumn().run()}>
          <Tooltip title={t("removeColumn")} placement="top">
            <span className={styles.iconBadgeWrapper}>
              <ViewColumnIcon sx={iconSx} />
              <span className={styles.iconBadge} style={{ color: getErrorMain(isDark) }}>x</span>
            </span>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Row add/remove */}
      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="addRow" aria-label={t("addRow")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().addRowAfter().run()}>
          <Tooltip title={t("addRow")} placement="top">
            <span className={styles.iconBadgeWrapper}>
              <TableRowsIcon sx={iconSx} />
              <span className={styles.iconBadge}>+</span>
            </span>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="removeRow" aria-label={t("removeRow")} className={styles.toggleBtnCompact} onClick={() => editor.chain().focus().deleteRow().run()}>
          <Tooltip title={t("removeRow")} placement="top">
            <span className={styles.iconBadgeWrapper}>
              <TableRowsIcon sx={iconSx} />
              <span className={styles.iconBadge} style={{ color: getErrorMain(isDark) }}>x</span>
            </span>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Alignment */}
      <ToggleButtonGroup
        exclusive
        size="small"
        className={styles.toggleGroup24}
        onChange={(_e, val) => { if (val) editor.chain().focus().setCellAttribute("textAlign", val).run(); }}
      >
        <ToggleButton value="left" aria-label={t("alignLeft")} className={styles.toggleBtnCompact}>
          <Tooltip title={t("alignLeft")} placement="top">
            <FormatAlignLeftIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="center" aria-label={t("alignCenter")} className={styles.toggleBtnCompact}>
          <Tooltip title={t("alignCenter")} placement="top">
            <FormatAlignCenterIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="right" aria-label={t("alignRight")} className={styles.toggleBtnCompact}>
          <Tooltip title={t("alignRight")} placement="top">
            <FormatAlignRightIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Move row */}
      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="rowUp" aria-label={t("moveRowUp")} className={styles.toggleBtnCompact} onClick={() => moveTableRow(editor, "up")}>
          <Tooltip title={t("moveRowUp")} placement="top">
            <MoveUpIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="rowDown" aria-label={t("moveRowDown")} className={styles.toggleBtnCompact} onClick={() => moveTableRow(editor, "down")}>
          <Tooltip title={t("moveRowDown")} placement="top">
            <MoveDownIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Move column */}
      <ToggleButtonGroup size="small" className={styles.toggleGroup24}>
        <ToggleButton value="colLeft" aria-label={t("moveColLeft")} className={styles.toggleBtnCompact} onClick={() => moveTableColumn(editor, "left")}>
          <Tooltip title={t("moveColLeft")} placement="top">
            <MoveUpIcon sx={{ ...iconSx, transform: "rotate(-90deg)" }} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="colRight" aria-label={t("moveColRight")} className={styles.toggleBtnCompact} onClick={() => moveTableColumn(editor, "right")}>
          <Tooltip title={t("moveColRight")} placement="top">
            <MoveDownIcon sx={{ ...iconSx, transform: "rotate(-90deg)" }} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem style={{ margin: "0 2px" }} />

      {editor.storage.searchReplace && <SearchReplaceBar editor={editor} t={t} />}
    </div>
  );
}

// --- Extracted sub-component: Compare mode side-by-side view ---
function TableCompareView({
  highlightedCompareHtml, tableWidth, isDark, t,
}: Readonly<{
  highlightedCompareHtml: string;
  tableWidth: string;
  isDark: boolean;
  t: (key: string) => string;
}>) {
  const selectedCellBg = getActionSelected(isDark);
  return (
    <div className={styles.compareOuter}>
      <div
        className={`${styles.comparePane} ${styles.comparePaneLeft}`}
        style={{ "--table-width": tableWidth, "--table-selected-cell-bg": selectedCellBg } as React.CSSProperties}
      >
        <Text
          variant="caption"
          component="span"
          className={styles.compareCaption}
          style={{ fontSize: SMALL_CAPTION_FONT_SIZE, color: getTextSecondary(isDark) }}
        >{t("compare")}</Text>
        <div dangerouslySetInnerHTML={{ __html: highlightedCompareHtml }} />
      </div>
      <div
        className={styles.comparePane}
        style={{ "--table-width": tableWidth, "--table-selected-cell-bg": selectedCellBg } as React.CSSProperties}
      >
        <Text
          variant="caption"
          component="span"
          className={styles.compareCaption}
          style={{ fontSize: SMALL_CAPTION_FONT_SIZE, color: getTextSecondary(isDark) }}
        >{t("compare")} - {t("edit")}</Text>
        <NodeViewContent<"table"> as="table" />
      </div>
    </div>
  );
}

const EMPTY_PAPER_STYLE: React.CSSProperties = {};

/** Paper の スタイルを構築する */
function buildPaperStyle(editOpen: boolean, isDark: boolean): React.CSSProperties {
  if (editOpen) {
    return {
      position: "fixed",
      inset: 0,
      zIndex: Z_FULLSCREEN,
      backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
    };
  }
  return EMPTY_PAPER_STYLE;
}

/** Paper の className を構築する */
function buildPaperClassName(editOpen: boolean, isEditable: boolean, showToolbar: boolean): string {
  const classes = [styles.paperRoot];
  if (editOpen) {
    classes.push(styles.paperEdit);
  } else {
    classes.push(styles.paperNormal);
    if (!isEditable) {
      classes.push(styles.paperTransparentBorder);
    }
  }
  if (!showToolbar) {
    classes.push(styles.paperHiddenToolbar);
  }
  return classes.join(" ");
}

/** テーブル本体 className を構築する */
function buildTableBodyClassName(collapsed: boolean, editOpen: boolean): string {
  if (collapsed) return styles.tableBodyCollapsed;
  if (editOpen) return styles.tableBodyEdit;
  return styles.tableBody;
}

/** 編集ヘッダーツールバー */
function TableEditHeader({ editor, isDark, isEditable, isSpreadsheet, onClose, t }: Readonly<{
  editor: Editor; isDark: boolean; isEditable: boolean; isSpreadsheet: boolean;
  onClose: () => void; t: (key: string) => string;
}>) {
  return (
    <div contentEditable={false}>
      <EditDialogHeader
        label={t("tableLabel")}
        onClose={onClose}
        icon={<TableChartIcon sx={{ fontSize: 18 }} />}
        t={t}
      />
      {isEditable && !isSpreadsheet && <TableOperationsToolbar editor={editor} isDark={isDark} t={t} />}
    </div>
  );
}

/** Extract compare-table HTML lookup from the useMemo to reduce component complexity. */
function getCompareTableHtml(
  editOpen: boolean,
  mergeEditors: ReturnType<typeof getMergeEditors>,
  editor: NodeViewProps["editor"] | null,
  getPos: NodeViewProps["getPos"],
): string | null {
  if (!editOpen || !mergeEditors || !editor || typeof getPos !== "function") return null;
  const pos = getPos();
  if (pos == null) return null;
  const isRight = !!editor.view?.dom?.dataset?.reviewMode;
  const otherEditor = isRight ? mergeEditors.rightEditor : mergeEditors.leftEditor;
  return findCounterpartTableHtml(editor, otherEditor, pos);
}

/** Get table grid options from editor extensions (extracted to reduce cognitive complexity). */
function getTableGridOptions(editor: Editor) {
  const tableExt = editor.extensionManager.extensions.find((e) => e.name === "table");
  return {
    gridRows: tableExt?.options?.gridRows as number | undefined,
    gridCols: tableExt?.options?.gridCols as number | undefined,
  };
}

/** Spreadsheet edit mode content (extracted to reduce cognitive complexity). */
function SpreadsheetEditContent({ editor, getPos, isDark, onDirtyChange, onClose }: Readonly<{
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  isDark: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}>) {
  const { gridRows, gridCols } = getTableGridOptions(editor);
  const adapter = useMemo(
    () =>
      createTiptapSheetAdapter(
        editor,
        () => {
          if (typeof getPos !== "function") return null;
          const pos = getPos();
          if (typeof pos !== "number") return null;
          const node = editor.state.doc.nodeAt(pos);
          if (node?.type.name !== "table") return null;
          return { node, pos };
        },
        { readOnly: !editor.isEditable },
      ),
    [editor, getPos],
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
      {/* ProseMirror table hidden but kept in DOM for sync */}
      <div style={{ display: "none" }}>
        <NodeViewContent<"table"> as="table" />
      </div>
    </SpreadsheetI18nProvider>
  );
}

/** Table content area dispatcher: compare view, spreadsheet edit, or inline table (extracted to reduce cognitive complexity). */
function TableContentArea({ showCompare, editOpen, collapsed, highlightedCompareHtml, tableWidth, isDark, editor, getPos, onDirtyChange, onSpreadsheetClose, onTableDoubleClick, t }: Readonly<{
  showCompare: boolean; editOpen: boolean; collapsed: boolean;
  highlightedCompareHtml: string | null;
  tableWidth: string;
  isDark: boolean;
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  onDirtyChange: (dirty: boolean) => void;
  onSpreadsheetClose: () => void;
  onTableDoubleClick: (() => void) | undefined;
  t: (key: string) => string;
}>) {
  if (showCompare) {
    return (
      <TableCompareView
        highlightedCompareHtml={highlightedCompareHtml ?? ''}
        tableWidth={tableWidth}
        isDark={isDark}
        t={t}
      />
    );
  }
  if (editOpen) {
    return (
      <SpreadsheetEditContent
        editor={editor}
        getPos={getPos}
        isDark={isDark}
        onDirtyChange={onDirtyChange}
        onClose={onSpreadsheetClose}
      />
    );
  }
  return (
    <div
      className={buildTableBodyClassName(collapsed, editOpen)}
      onDoubleClick={onTableDoubleClick}
    >
      <NodeViewContent<"table"> as="table" />
    </div>
  );
}

/** Discard-changes confirmation dialog for table (extracted to reduce cognitive complexity). */
function TableDiscardDialog({ open, onClose, onConfirm, t }: Readonly<{
  open: boolean; onClose: () => void; onConfirm: () => void; t: (key: string) => string;
}>) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("spreadsheetDiscardTitle")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("spreadsheetDiscardMessage")}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("spreadsheetDiscardCancel")}</Button>
        <Button onClick={onConfirm} color="error">{t("spreadsheetDiscardConfirm")}</Button>
      </DialogActions>
    </Dialog>
  );
}

interface TableActions {
  onEdit: (() => void) | undefined;
  onDelete: (() => void) | undefined;
  onTableDoubleClick: (() => void) | undefined;
}

function buildTableActions(
  flags: Readonly<{ canInteract: boolean; isEditable: boolean }>,
  callbacks: Readonly<{ openEdit: () => void; openDelete: () => void }>,
): TableActions {
  return {
    onEdit: flags.canInteract ? callbacks.openEdit : undefined,
    onDelete: flags.canInteract ? callbacks.openDelete : undefined,
    onTableDoubleClick: flags.isEditable ? undefined : callbacks.openEdit,
  };
}

interface DialogPaperProps {
  role?: "dialog";
  "aria-modal"?: true;
  "aria-label"?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function buildDialogPaperProps(
  editOpen: boolean,
  ariaLabel: string,
  onEscape: () => void,
): DialogPaperProps {
  if (!editOpen) return {};
  return {
    role: "dialog",
    "aria-modal": true,
    "aria-label": ariaLabel,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    },
  };
}

export function TableNodeView({ editor, node, getPos }: Readonly<NodeViewProps>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useTheme().palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const {
    deleteDialogOpen, setDeleteDialogOpen, editOpen, setEditOpen,
    collapsed, isEditable, isSelected: _isSelected, handleDeleteBlock, showToolbar, isCompareLeft,
  } = useBlockNodeState(editor, node, getPos);

  // Compare mode
  const mergeEditors = getMergeEditors();
  const isCompareMode = !!mergeEditors;
  const compareTableHtml = useMemo(
    () => getCompareTableHtml(editOpen, mergeEditors, editor, getPos),
    [editOpen, mergeEditors, editor, getPos],
  );

  const highlightedCompareHtml = useMemo(() => {
    if (!compareTableHtml) return null;
    return buildHighlightedCompareHtml(compareTableHtml, node.content, settings.tableWidth);
  }, [compareTableHtml, node.content, settings.tableWidth]);

  const showCompare = editOpen && isCompareMode && !!highlightedCompareHtml;
  const canInteract = !collapsed && !isCompareLeft;
  const showInlineToolbar = !editOpen && isEditable;

  // スプレッドシートの未適用変更追跡
  const spreadsheetDirtyRef = useRef(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    spreadsheetDirtyRef.current = dirty;
  }, []);

  const tryCloseEdit = useCallback(() => {
    if (spreadsheetDirtyRef.current) {
      setDiscardDialogOpen(true);
    } else {
      setEditOpen(false);
    }
  }, [setEditOpen]);

  const handleDiscardConfirm = useCallback(() => {
    setDiscardDialogOpen(false);
    spreadsheetDirtyRef.current = false;
    setEditOpen(false);
  }, [setEditOpen]);

  const handleSpreadsheetClose = useCallback(() => {
    spreadsheetDirtyRef.current = false;
    setEditOpen(false);
  }, [setEditOpen]);

  const tableActions = buildTableActions(
    { canInteract, isEditable },
    {
      openEdit: () => setEditOpen(true),
      openDelete: () => setDeleteDialogOpen(true),
    },
  );
  const dialogProps = buildDialogPaperProps(editOpen, t("tableLabel"), tryCloseEdit);

  return (
    <NodeViewWrapper className="block-node-wrapper">
      <Paper
        {...dialogProps}
        tabIndex={editOpen ? -1 : undefined}
        className={buildPaperClassName(editOpen, isEditable, showToolbar)}
        style={buildPaperStyle(editOpen, isDark)}
      >
        {editOpen && <TableEditHeader editor={editor} isDark={isDark} isEditable={isEditable} isSpreadsheet={!showCompare} onClose={tryCloseEdit} t={t} />}

        {showInlineToolbar && (
          <BlockInlineToolbar
            label={t("tableLabel")}
            onEdit={tableActions.onEdit}
            onDelete={tableActions.onDelete}
            collapsed={collapsed}
            labelDivider
            t={t}
          />
        )}

        <TableContentArea
          showCompare={showCompare}
          editOpen={editOpen}
          collapsed={collapsed}
          highlightedCompareHtml={highlightedCompareHtml}
          tableWidth={settings.tableWidth}
          isDark={isDark}
          editor={editor}
          getPos={getPos}
          onDirtyChange={handleDirtyChange}
          onSpreadsheetClose={handleSpreadsheetClose}
          onTableDoubleClick={tableActions.onTableDoubleClick}
          t={t}
        />
      </Paper>
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
      <TableDiscardDialog
        open={discardDialogOpen}
        onClose={() => setDiscardDialogOpen(false)}
        onConfirm={handleDiscardConfirm}
        t={t}
      />
    </NodeViewWrapper>
  );
}
