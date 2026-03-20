"use client";

import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import MoveDownIcon from "@mui/icons-material/MoveDown";
import MoveUpIcon from "@mui/icons-material/MoveUp";
import TableChartIcon from "@mui/icons-material/TableChart";
import TableRowsIcon from "@mui/icons-material/TableRows";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import { Box, Divider, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from "@mui/material";
import type { Fragment } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { BlockInlineToolbar } from "./components/codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./components/codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./components/EditDialogHeader";
import { SearchReplaceBar } from "./components/SearchReplaceBar";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "./constants/colors";
import { Z_FULLSCREEN } from "./constants/zIndex";
import { findCounterpartTableHtml, getMergeEditors } from "./contexts/MergeEditorsContext";
import { useBlockNodeState } from "./hooks/useBlockNodeState";
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
function TableOperationsToolbar({ editor, t }: { editor: Editor; t: (key: string) => string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, gap: 0.5, flexWrap: "wrap" }}>
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
              <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1, color: "error.main" }}>x</Box>
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
              <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1, color: "error.main" }}>x</Box>
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
}: {
  highlightedCompareHtml: string;
  tableSx: Record<string, unknown>;
  isDark: boolean;
  t: (key: string) => string;
}) {
  return (
    <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, p: 2, borderRight: 1, borderColor: "divider" }}>
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem", mb: 1, display: "block" }}>{t("compare")}</Typography>
        <Box
          dangerouslySetInnerHTML={{ __html: highlightedCompareHtml }}
          sx={{ "& table": tableSx }}
        />
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, p: 2, "& table": tableSx }}>
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem", mb: 1, display: "block" }}>{t("compare")} - {t("edit")}</Typography>
        <NodeViewContent<"table"> as="table" />
      </Box>
    </Box>
  );
}

export function TableNodeView({ editor, node, getPos }: NodeViewProps) {
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
  const compareTableHtml = useMemo(() => {
    if (!editOpen || !mergeEditors || !editor || typeof getPos !== "function") return null;
    const pos = getPos();
    if (pos == null) return null;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.rightEditor : mergeEditors.leftEditor;
    return findCounterpartTableHtml(editor, otherEditor, pos);
  }, [editOpen, mergeEditors, editor, getPos]);

  const highlightedCompareHtml = useMemo(() => {
    if (!compareTableHtml) return null;
    return buildHighlightedCompareHtml(compareTableHtml, node.content, settings.tableWidth);
  }, [compareTableHtml, node.content, settings.tableWidth]);

  const tableSx = {
    borderCollapse: "collapse",
    width: settings.tableWidth,
    "& th, & td": { border: 1, borderColor: "divider", px: 1, py: 0.5, textAlign: "left", minWidth: 80, bgcolor: "background.paper" },
    "& th": { bgcolor: "action.hover", fontWeight: 600 },
    "& .selectedCell": { bgcolor: "action.selected" },
  };

  return (
    <NodeViewWrapper>
      <Paper
        component={editOpen ? "div" : Box}
        elevation={editOpen ? 24 : 0}
        {...(editOpen && {
          role: "dialog" as const,
          "aria-modal": true,
          "aria-label": t("tableLabel"),
          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") setEditOpen(false); },
        })}
        tabIndex={editOpen ? -1 : undefined}
        sx={{
          border: editOpen ? 0 : 1,
          borderColor: isEditable ? "divider" : "transparent",
          borderRadius: editOpen ? 0 : 1,
          overflow: "hidden",
          my: editOpen ? 0 : 1,
          ...(!editOpen && { bgcolor: "transparent" }),
          ...(editOpen && {
            position: "fixed",
            inset: 0,
            zIndex: Z_FULLSCREEN,
            display: "flex",
            flexDirection: "column",
            bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
          }),
          ...(!showToolbar && {
            borderColor: "transparent",
            "& > [data-block-toolbar]": {
              maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
            },
          }),
        }}
      >
        {/* Edit header toolbar */}
        {editOpen && (
          <Box contentEditable={false}>
            <EditDialogHeader
              label={t("tableLabel")}
              onClose={() => setEditOpen(false)}
              icon={<TableChartIcon sx={{ fontSize: 18 }} />}
              t={t}
            />
            {isEditable && <TableOperationsToolbar editor={editor} t={t} />}
          </Box>
        )}

        {/* Inline toolbar (non-edit) */}
        {!editOpen && isEditable && (
          <BlockInlineToolbar
            label={t("tableLabel")}
            onEdit={!collapsed && !isCompareLeft ? () => setEditOpen(true) : undefined}
            onDelete={!collapsed && !isCompareLeft ? () => setDeleteDialogOpen(true) : undefined}
            collapsed={collapsed}
            t={t}
          />
        )}

        {/* Table body */}
        {editOpen && isCompareMode && highlightedCompareHtml ? (
          <TableCompareView
            highlightedCompareHtml={highlightedCompareHtml}
            tableSx={tableSx}
            isDark={isDark}
            t={t}
          />
        ) : (
          <Box
            sx={collapsed
              ? { height: 0, overflow: "hidden" }
              : {
                  overflow: "auto",
                  ...(editOpen && {
                    flex: 1,
                    bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
                    p: 2,
                    "& table": tableSx,
                  }),
                }
            }
            onDoubleClick={!isEditable ? () => setEditOpen(true) : undefined}
          >
            <NodeViewContent<"table"> as="table" />
          </Box>
        )}
      </Paper>
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
    </NodeViewWrapper>
  );
}
