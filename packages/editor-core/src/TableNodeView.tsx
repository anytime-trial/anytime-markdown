"use client";

import { useCallback, useState } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, NodeViewContent, useEditorState } from "@tiptap/react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import FocusTrap from "@mui/material/Unstable_TrapFocus";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import TableRowsIcon from "@mui/icons-material/TableRows";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import MoveUpIcon from "@mui/icons-material/MoveUp";
import MoveDownIcon from "@mui/icons-material/MoveDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CloseIcon from "@mui/icons-material/Close";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import { useTranslations } from "next-intl";
import { moveTableRow, moveTableColumn } from "./utils/tableHelpers";
import { SearchReplaceBar } from "./components/SearchReplaceBar";

const iconSx = { fontSize: 16 };

export function TableNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const t = useTranslations("MarkdownEditor");
  const [fullscreen, setFullscreen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const collapsed = !!node.attrs.collapsed;
  const toggleCollapsed = useCallback(() => updateAttributes({ collapsed: !collapsed }), [collapsed, updateAttributes]);
  const isEditable = editor?.isEditable ?? true;

  // エディタのセレクションがこのテーブル内にあるかを検出
  const isSelected = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || typeof getPos !== "function") return false;
      const pos = getPos();
      if (pos == null) return false;
      const from = ctx.editor.state.selection.from;
      return from >= pos && from <= pos + node.nodeSize;
    },
  });

  // ツールバーの表示条件: 編集可能時のみ（折りたたみ中・全画面中・テーブル内選択中）
  const showToolbar = isEditable && (collapsed || fullscreen || isSelected);

  return (
    <NodeViewWrapper>
      <FocusTrap open={fullscreen}>
      <Box
        {...(fullscreen && {
          role: "dialog" as const,
          "aria-modal": true,
          "aria-label": t("tableLabel"),
          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); },
        })}
        tabIndex={fullscreen ? -1 : undefined}
        sx={{
          border: 1,
          borderColor: isEditable ? "divider" : "transparent",
          borderRadius: fullscreen ? 0 : 1,
          overflow: "hidden",
          my: fullscreen ? 0 : 1,
          ...(fullscreen && {
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
          }),
          ...(!showToolbar && {
            borderColor: "transparent",
            "& > [data-block-toolbar]": {
              maxHeight: 0,
              opacity: 0,
              py: 0,
              overflow: "hidden",
            },
          }),
        }}
      >
        {/* Header toolbar (hidden in view mode) */}
        {isEditable && <Box
          data-block-toolbar=""
          role="toolbar"
          aria-label={t("tableToolbar")}
          sx={{
            bgcolor: "action.hover",
            px: 0.75,
            py: 0.25,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0.25,
          }}
          contentEditable={false}
        >
          {/* Drag handle (hidden in fullscreen or view mode) */}
          {!fullscreen && isEditable && (
            <Box
              data-drag-handle=""
              role="button"
              tabIndex={0}
              aria-roledescription="drag"
              aria-label={t("dragHandle")}
              sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
            >
              <DragIndicatorIcon sx={iconSx} />
            </Box>
          )}
          {/* Collapse/Expand (hidden in fullscreen) */}
          {!fullscreen && (
            <Tooltip title={collapsed ? t("unfoldAll") : t("foldAll")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={toggleCollapsed} aria-label={collapsed ? t("unfoldAll") : t("foldAll")}>
                {collapsed ? <UnfoldMoreIcon sx={iconSx} /> : <UnfoldLessIcon sx={iconSx} />}
              </IconButton>
            </Tooltip>
          )}
          {/* Fullscreen enter (not shown in fullscreen — close is at right end) */}
          {!collapsed && !fullscreen && (
            <Tooltip title={t("fullscreen")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(true)} aria-label={t("fullscreen")}>
                <FullscreenIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          )}
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mr: 0.5 }}>
            {t("tableLabel")}
          </Typography>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

          {/* Search & Replace (fullscreen only) */}
          {fullscreen && (
            <SearchReplaceBar editor={editor} t={t} />
          )}

          {!collapsed && isEditable && (
            <>
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
                      <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1, color: "error.main" }}>×</Box>
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
                      <Box component="span" sx={{ position: "absolute", right: -4, top: -4, fontSize: 10, fontWeight: "bold", lineHeight: 1, color: "error.main" }}>×</Box>
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
            </>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Delete table (hidden in fullscreen, collapsed, or view mode) */}
          {!fullscreen && !collapsed && isEditable && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
              <Tooltip title={t("deleteTable")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("deleteTable")}>
                  <DeleteOutlineIcon sx={iconSx} />
                </IconButton>
              </Tooltip>
            </>
          )}
          {/* Close fullscreen (right end) */}
          {fullscreen && (
            <Tooltip title={t("close")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(false)} aria-label={t("close")}>
                <CloseIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          )}
        </Box>}

        {/* Table body */}
        <Box
          sx={collapsed ? { height: 0, overflow: "hidden" } : { overflow: "auto", ...(fullscreen && { flex: 1 }) }}
          onDoubleClick={!isEditable ? () => setFullscreen(true) : undefined}
        >
          <NodeViewContent<"table"> as="table" />
        </Box>
      </Box>
      </FocusTrap>
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t("delete")}</DialogTitle>
        <DialogContent><Typography>{t("clearConfirm")}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
          <Button color="error" variant="contained" onClick={() => {
            setDeleteDialogOpen(false);
            if (typeof getPos !== "function") return;
            const pos = getPos();
            if (pos == null) return;
            const to = pos + node.nodeSize;
            editor.chain().focus().command(({ tr }) => { tr.delete(pos, to); return true; }).run();
          }}>{t("delete")}</Button>
        </DialogActions>
      </Dialog>
    </NodeViewWrapper>
  );
}
