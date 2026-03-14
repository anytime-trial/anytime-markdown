"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import { Alert, Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DOMPurify from "dompurify";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../../constants/colors";
import { PREVIEW_MAX_HEIGHT } from "../../constants/dimensions";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { MATH_SANITIZE_CONFIG,useKatexRender } from "../../hooks/useKatexRender";
import { MathFullscreenDialog } from "../MathFullscreenDialog";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

type MathBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "fullscreen" | "setFullscreen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
> & {
  handleFsTextChange: (newCode: string) => void;
};

export function MathBlock(props: MathBlockProps) {
  const {
    editor, node, updateAttributes, getPos,
    codeCollapsed, isSelected,
    selectNode, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    fullscreen, setFullscreen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    handleFsTextChange,
    t, isDark,
  } = props;

  const { html: mathHtml, error: mathError } = useKatexRender({ code, isMath: true });

  const { isCompareMode, compareCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos, language: "math", code, fullscreen,
  });

  const toolbar = (
    <Box
      data-block-toolbar=""
      sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
      contentEditable={false}
    >
      <Box
        data-drag-handle=""
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
        aria-label={t("dragHandle")}
        sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
      </Box>
      <Tooltip title={t("fullscreen")} placement="top">
        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(true)} aria-label={t("fullscreen")}>
          <FullscreenIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        </IconButton>
      </Tooltip>
      <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
        Math
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
      <Tooltip title={t("delete")} placement="top">
        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <CodeBlockFrame
      toolbar={toolbar}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={isSelected && editor.isEditable}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <MathFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label="Math"
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          onFsTextChange={handleFsTextChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          readOnly={!editor.isEditable}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          toolbarExtra={
            <Tooltip title={t("copyCode")} placement="bottom">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              </IconButton>
            </Tooltip>
          }
          t={t}
        />
      }
    >
      {mathError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>{mathError}</Alert>
      )}
      {mathHtml && (
        <Box
          contentEditable={false}
          role="img"
          aria-label={`${t("mathFormula")}: ${code}`}
          onClick={() => { selectNode(); if (!codeCollapsed) updateAttributes({ codeCollapsed: true }); }}
          onDoubleClick={() => setFullscreen(true)}
          sx={{ pt: 0, px: 2, pb: 2, bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, borderTop: codeCollapsed ? 0 : 1, borderColor: "divider", overflow: "auto", maxHeight: PREVIEW_MAX_HEIGHT, display: "flex", justifyContent: "flex-start", cursor: "pointer" }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
        />
      )}
    </CodeBlockFrame>
  );
}
