"use client";

import { SpreadsheetGrid } from "@anytime-markdown/spreadsheet-viewer";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import MoveDownIcon from "@mui/icons-material/MoveDown";
import MoveUpIcon from "@mui/icons-material/MoveUp";
import TableChartIcon from "@mui/icons-material/TableChart";
import TableRowsIcon from "@mui/icons-material/TableRows";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from "@mui/material";
import type { Fragment } from "@tiptap/pm/model";
import type { Editor, NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import { BlockInlineToolbar } from "./components/codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./components/codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./components/EditDialogHeader";
import { SearchReplaceBar } from "./components/SearchReplaceBar";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getActionSelected, getBgPaper, getDivider, getErrorMain, getTextSecondary } from "./constants/colors";
import { SMALL_CAPTION_FONT_SIZE } from "./constants/dimensions";
import { Z_FULLSCREEN } from "./constants/zIndex";
import { findCounterpartTableHtml, getMergeEditors } from "./contexts/MergeEditorsContext";
import { useBlockNodeState } from "./hooks/useBlockNodeState";
import { createTiptapSheetAdapter } from "./spreadsheet/TiptapSheetAdapter";
import { useEditorSettingsContext } from "./useEditorSettings";
import { moveTableColumn,moveTableRow } from "./utils/tableHelpers";

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
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark), px: 1, py: 0.25, gap: 0.5, flexWrap: "wrap" }}>
      {/* Column add/remove */}
      <ToggleButtonGroup size="small" sx={{ height: 24 }}>
        <ToggleButton value="addCol" aria-label={t("addColumn")} sx={{ px: 0.5, py: 0.125 }} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <Tooltip title={t("addColumn")} placement="top">
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <ViewColumnIcon sx={iconSx} />
              <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1 }}>+</Box>
            </Box>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="removeCol" aria-label={t("removeColumn")} sx={{ px: 0.5, py: 0.125 }} onClick={() => editor.chain().focus().deleteColumn().run()}>
          <Tooltip title={t("removeColumn")} placement="top">
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <ViewColumnIcon sx={iconSx} />
              <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1, color: getErrorMain(isDark) }}>x</Box>
            </Box>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Row add/remove */}
      <ToggleButtonGroup size="small" sx={{ height: 24 }}>
        <ToggleButton value="addRow" aria-label={t("addRow")} sx={{ px: 0.5, py: 0.125 }} onClick={() => editor.chain().focus().addRowAfter().run()}>
          <Tooltip title={t("addRow")} placement="top">
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <TableRowsIcon sx={iconSx} />
              <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1 }}>+</Box>
            </Box>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="removeRow" aria-label={t("removeRow")} sx={{ px: 0.5, py: 0.125 }} onClick={() => editor.chain().focus().deleteRow().run()}>
          <Tooltip title={t("removeRow")} placement="top">
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <TableRowsIcon sx={iconSx} />
              <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1, color: getErrorMain(isDark) }}>x</Box>
            </Box>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Alignment */}
      <ToggleButtonGroup
        exclusive
        size="small"
        sx={{ height: 24 }}
        onChange={(_e, val) => { if (val) editor.chain().focus().setCellAttribute("textAlign", val).run(); }}
      >
        <ToggleButton value="left" aria-label={t("alignLeft")} sx={{ px: 0.5, py: 0.125 }}>
          <Tooltip title={t("alignLeft")} placement="top">
            <FormatAlignLeftIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="center" aria-label={t("alignCenter")} sx={{ px: 0.5, py: 0.125 }}>
          <Tooltip title={t("alignCenter")} placement="top">
            <FormatAlignCenterIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="right" aria-label={t("alignRight")} sx={{ px: 0.5, py: 0.125 }}>
          <Tooltip title={t("alignRight")} placement="top">
            <FormatAlignRightIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Move row */}
      <ToggleButtonGroup size="small" sx={{ height: 24 }}>
        <ToggleButton value="rowUp" aria-label={t("moveRowUp")} sx={{ px: 0.5, py: 0.125 }} onClick={() => moveTableRow(editor, "up")}>
          <Tooltip title={t("moveRowUp")} placement="top">
            <MoveUpIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="rowDown" aria-label={t("moveRowDown")} sx={{ px: 0.5, py: 0.125 }} onClick={() => moveTableRow(editor, "down")}>
          <Tooltip title={t("moveRowDown")} placement="top">
            <MoveDownIcon sx={iconSx} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Move column */}
      <ToggleButtonGroup size="small" sx={{ height: 24 }}>
        <ToggleButton value="colLeft" aria-label={t("moveColLeft")} sx={{ px: 0.5, py: 0.125 }} onClick={() => moveTableColumn(editor, "left")}>
          <Tooltip title={t("moveColLeft")} placement="top">
            <MoveUpIcon sx={{ ...iconSx, transform: "rotate(-90deg)" }} />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="colRight" aria-label={t("moveColRight")} sx={{ px: 0.5, py: 0.125 }} onClick={() => moveTableColumn(editor, "right")}>
          <Tooltip title={t("moveColRight")} placement="top">
            <MoveDownIcon sx={{ ...iconSx, transform: "rotate(-90deg)" }} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

      {editor.storage.searchReplace && <SearchReplaceBar editor={editor} t={t} />}
    </Box>
  );
}

// --- Extracted sub-component: Compare mode side-by-side view ---
function TableCompareView({
  highlightedCompareHtml, tableSx, isDark, t,
}: Readonly<{
  highlightedCompareHtml: string;
  tableSx: Record<string, unknown>;
  isDark: boolean;
  t: (key: string) => string;
}>) {
  return (
    <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, p: 2, borderRight: 1, borderColor: getDivider(isDark) }}>
        <Typography variant="caption" sx={{ color: getTextSecondary(isDark), fontSize: SMALL_CAPTION_FONT_SIZE, mb: 1, display: "block" }}>{t("compare")}</Typography>
        <Box
          dangerouslySetInnerHTML={{ __html: highlightedCompareHtml }}
          sx={{ "& table": tableSx }}
        />
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, p: 2, "& table": tableSx }}>
        <Typography variant="caption" sx={{ color: getTextSecondary(isDark), fontSize: SMALL_CAPTION_FONT_SIZE, mb: 1, display: "block" }}>{t("compare")} - {t("edit")}</Typography>
        <NodeViewContent<"table"> as="table" />
      </Box>
    </Box>
  );
}

/** Paper の sx スタイルを構築する */
function buildPaperSx(editOpen: boolean, isEditable: boolean, isDark: boolean, showToolbar: boolean) {
  const base = {
    border: editOpen ? 0 : 1,
    borderColor: isEditable ? getDivider(isDark) : "transparent",
    borderRadius: editOpen ? 0 : 1,
    overflow: "hidden",
    my: editOpen ? 0 : 1,
  };
  const editClosedSx = editOpen ? {} : { bgcolor: "transparent" };
  const editOpenSx = editOpen ? {
    position: "fixed" as const,
    inset: 0,
    zIndex: Z_FULLSCREEN,
    display: "flex",
    flexDirection: "column" as const,
    bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
  } : {};
  const hiddenToolbarSx = showToolbar ? {} : {
    borderColor: "transparent",
    "& > [data-block-toolbar]": {
      maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
    },
  };
  return { ...base, ...editClosedSx, ...editOpenSx, ...hiddenToolbarSx };
}

/** テーブル本体の sx スタイルを構築する */
function buildTableBodySx(collapsed: boolean, editOpen: boolean, isDark: boolean, tableSx: Record<string, unknown>) {
  if (collapsed) return { height: 0, overflow: "hidden" };
  return {
    overflow: "auto",
    ...(editOpen && {
      flex: 1,
      bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      p: 2,
      "& table": tableSx,
    }),
  };
}

/** 編集ヘッダーツールバー */
function TableEditHeader({ editor, isDark, isEditable, isSpreadsheet, onClose, t }: Readonly<{
  editor: Editor; isDark: boolean; isEditable: boolean; isSpreadsheet: boolean;
  onClose: () => void; t: (key: string) => string;
}>) {
  return (
    <Box contentEditable={false}>
      <EditDialogHeader
        label={t("tableLabel")}
        onClose={onClose}
        icon={<TableChartIcon sx={{ fontSize: 18 }} />}
        t={t}
      />
      {isEditable && !isSpreadsheet && <TableOperationsToolbar editor={editor} isDark={isDark} t={t} />}
    </Box>
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

/** Build table cell styles (extracted to reduce cognitive complexity). */
function buildTableSx(isDark: boolean, tableWidth: string) {
  return {
    borderCollapse: "collapse",
    width: tableWidth,
    "& th, & td": { border: 1, borderColor: getDivider(isDark), px: 1, py: 0.5, textAlign: "left", minWidth: 80, bgcolor: getBgPaper(isDark) },
    "& th": { bgcolor: getActionHover(isDark), fontWeight: 600 },
    "& .selectedCell": { bgcolor: getActionSelected(isDark) },
  };
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
  const tSheet = useTranslations("Spreadsheet");
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
          if (!node || node.type.name !== "table") return null;
          return { node, pos };
        },
        { readOnly: !editor.isEditable },
      ),
    [editor, getPos],
  );
  const handleUndo = useCallback(() => { editor.chain().undo().run(); }, [editor]);
  const handleRedo = useCallback(() => { editor.chain().redo().run(); }, [editor]);
  return (
    <>
      <SpreadsheetGrid
        adapter={adapter}
        isDark={isDark}
        t={tSheet}
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
      <Box sx={{ display: "none" }}>
        <NodeViewContent<"table"> as="table" />
      </Box>
    </>
  );
}

/** Table content area dispatcher: compare view, spreadsheet edit, or inline table (extracted to reduce cognitive complexity). */
function TableContentArea({ showCompare, editOpen, collapsed, highlightedCompareHtml, tableSx, editor, getPos, isDark, onDirtyChange, onSpreadsheetClose, onTableDoubleClick, t }: Readonly<{
  showCompare: boolean; editOpen: boolean; collapsed: boolean;
  highlightedCompareHtml: string | null;
  tableSx: Record<string, unknown>;
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  isDark: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSpreadsheetClose: () => void;
  onTableDoubleClick: (() => void) | undefined;
  t: (key: string) => string;
}>) {
  if (showCompare) {
    return (
      <TableCompareView
        highlightedCompareHtml={highlightedCompareHtml ?? ''}
        tableSx={tableSx}
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
    <Box
      sx={buildTableBodySx(collapsed, editOpen, isDark, tableSx)}
      onDoubleClick={onTableDoubleClick}
    >
      <NodeViewContent<"table"> as="table" />
    </Box>
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

export function TableNodeView({ editor, node, getPos }: Readonly<NodeViewProps>) {
  const t = useTranslations("MarkdownEditor");
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

  const tableSx = buildTableSx(isDark, settings.tableWidth);

  const showCompare = editOpen && isCompareMode && !!highlightedCompareHtml;
  const canInteract = !collapsed && !isCompareLeft;
  const showInlineToolbar = !editOpen && isEditable;

  const onEditAction = canInteract ? () => setEditOpen(true) : undefined;
  const onDeleteAction = canInteract ? () => setDeleteDialogOpen(true) : undefined;
  const onTableDoubleClick = isEditable ? undefined : () => setEditOpen(true);

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

  const dialogProps = editOpen ? {
    role: "dialog" as const,
    "aria-modal": true as const,
    "aria-label": t("tableLabel"),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") tryCloseEdit(); },
  } : {};

  return (
    <NodeViewWrapper className="block-node-wrapper">
      <Paper
        component={editOpen ? "div" : Box}
        elevation={editOpen ? 24 : 0}
        {...dialogProps}
        tabIndex={editOpen ? -1 : undefined}
        sx={buildPaperSx(editOpen, isEditable, isDark, showToolbar)}
      >
        {editOpen && <TableEditHeader editor={editor} isDark={isDark} isEditable={isEditable} isSpreadsheet={!showCompare} onClose={tryCloseEdit} t={t} />}

        {showInlineToolbar && (
          <BlockInlineToolbar
            label={t("tableLabel")}
            onEdit={onEditAction}
            onDelete={onDeleteAction}
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
          tableSx={tableSx}
          editor={editor}
          getPos={getPos}
          isDark={isDark}
          onDirtyChange={handleDirtyChange}
          onSpreadsheetClose={handleSpreadsheetClose}
          onTableDoubleClick={onTableDoubleClick}
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
