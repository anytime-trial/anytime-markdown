"use client";

import CloseIcon from "@mui/icons-material/Close";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import MoveDownIcon from "@mui/icons-material/MoveDown";
import MoveUpIcon from "@mui/icons-material/MoveUp";
import TableRowsIcon from "@mui/icons-material/TableRows";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import { Box, Divider, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BlockInlineToolbar } from "./components/codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./components/codeblock/DeleteBlockDialog";
import { SearchReplaceBar } from "./components/SearchReplaceBar";
import { useDeleteBlock } from "./hooks/useDeleteBlock";
import { useNodeSelected } from "./hooks/useNodeSelected";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getFullscreenBg } from "./constants/colors";
import { Z_FULLSCREEN } from "./constants/zIndex";
import { useEditorSettingsContext } from "./useEditorSettings";
import { moveTableColumn,moveTableRow } from "./utils/tableHelpers";

const iconSx = { fontSize: 16 };

export function TableNodeView({ editor, node, getPos }: NodeViewProps) {
  const t = useTranslations("MarkdownEditor");
  const isDark = useTheme().palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const [fullscreen, setFullscreen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const collapsed = !!node.attrs.collapsed;
  const isEditable = editor?.isEditable ?? true;

  const isSelected = useNodeSelected(editor, getPos, node.nodeSize);
  const handleDeleteBlock = useDeleteBlock(editor, getPos, node.nodeSize);

  const showToolbar = isEditable && (collapsed || fullscreen || isSelected);

  const fsBg = getFullscreenBg(isDark, settings) ?? (isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG);

  return (
    <NodeViewWrapper>
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
            zIndex: Z_FULLSCREEN,
            bgcolor: fsBg,
            display: "flex",
            flexDirection: "column",
          }),
          ...(!showToolbar && {
            borderColor: "transparent",
            "& > [data-block-toolbar]": {
              maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
            },
          }),
        }}
      >
        {/* Fullscreen header toolbar (Mermaid-style) */}
        {fullscreen && (
          <Box
            sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", flexWrap: "wrap", gap: 0.5 }}
            contentEditable={false}
          >
            <Tooltip title={t("close")} placement="bottom">
              <IconButton size="small" onClick={() => setFullscreen(false)} sx={{ mr: 1 }} aria-label={t("close")}>
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "0.875rem", mr: 1 }}>
              {t("tableLabel")}
            </Typography>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

            <SearchReplaceBar editor={editor} t={t} />

            {isEditable && (<>
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
            </>)}

            <Box sx={{ flex: 1 }} />
          </Box>
        )}

        {/* Inline toolbar (non-fullscreen) */}
        {!fullscreen && isEditable && (
          <BlockInlineToolbar
            label={t("tableLabel")}
            onFullscreen={!collapsed ? () => setFullscreen(true) : undefined}
            onDelete={!collapsed ? () => setDeleteDialogOpen(true) : undefined}
            collapsed={collapsed}
            t={t}
          />
        )}

        {/* Table body (single instance, shared between inline and fullscreen) */}
        <Box
          sx={collapsed
            ? { height: 0, overflow: "hidden" }
            : {
                overflow: "auto",
                ...(fullscreen && {
                  flex: 1,
                  bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
                  p: 2,
                  "& table": {
                    borderCollapse: "collapse",
                    width: "100%",
                    "& th, & td": { border: 1, borderColor: "divider", px: 1, py: 0.5, textAlign: "left", minWidth: 80 },
                    "& th": { bgcolor: "action.hover", fontWeight: 600 },
                    "& .selectedCell": { bgcolor: "action.selected" },
                  },
                }),
              }
          }
          onDoubleClick={!isEditable ? () => setFullscreen(true) : undefined}
        >
          <NodeViewContent<"table"> as="table" />
        </Box>
      </Box>
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
    </NodeViewWrapper>
  );
}
