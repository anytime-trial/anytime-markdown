"use client";

import { useState } from "react";
import { Alert, Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import SchemaIcon from "@mui/icons-material/Schema";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DOMPurify from "dompurify";
import { useKatexRender, MATH_SANITIZE_CONFIG } from "../../hooks/useKatexRender";
import { CodeBlockFullscreenDialog } from "../CodeBlockFullscreenDialog";
import { MathSamplePopover } from "../MathSamplePopover";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

type MathBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "getPos"
  | "allCollapsed" | "codeCollapsed" | "isSelected" | "toggleAllCollapsed"
  | "selectNode" | "handleDragKeyDown" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "fullscreen" | "setFullscreen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
>;

export function MathBlock(props: MathBlockProps) {
  const {
    editor, node, getPos,
    allCollapsed, codeCollapsed, isSelected, toggleAllCollapsed,
    selectNode, handleDragKeyDown, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    fullscreen, setFullscreen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    t, isDark,
  } = props;

  const [mathSampleAnchorEl, setMathSampleAnchorEl] = useState<HTMLElement | null>(null);
  const { html: mathHtml, error: mathError } = useKatexRender({ code, isMath: true });

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
        onKeyDown={handleDragKeyDown}
        sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
      </Box>
      <Tooltip title={allCollapsed ? t("unfoldAll") : t("foldAll")} placement="top">
        <IconButton size="small" sx={{ p: 0.25 }} onClick={toggleAllCollapsed} aria-label={allCollapsed ? t("unfoldAll") : t("foldAll")}>
          {allCollapsed ? <UnfoldMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <UnfoldLessIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
        </IconButton>
      </Tooltip>
      {!allCollapsed && (
        <Tooltip title={t("fullscreen")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(true)} aria-label={t("fullscreen")}>
            <FullscreenIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
      )}
      <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
        Math
      </Typography>
      {!allCollapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title={t("insertSample")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setMathSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
            <SchemaIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
      </>)}
      <Box sx={{ flex: 1 }} />
      {!allCollapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title={t("copyCode")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
            <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </>)}
    </Box>
  );

  return (
    <CodeBlockFrame
      toolbar={toolbar}
      allCollapsed={allCollapsed}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={allCollapsed || isSelected}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={<>
        <CodeBlockFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label="Math"
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          t={t}
        />
        <MathSamplePopover
          anchorEl={mathSampleAnchorEl}
          onClose={() => setMathSampleAnchorEl(null)}
          editor={editor}
          t={t}
          getPos={getPos}
          nodeContentSize={node.content.size}
        />
      </>}
    >
      {!allCollapsed && mathError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>{mathError}</Alert>
      )}
      {!allCollapsed && mathHtml && (
        <Box
          contentEditable={false}
          onClick={selectNode}
          sx={{ p: 2, bgcolor: "background.paper", borderTop: codeCollapsed ? 0 : 1, borderColor: "divider", overflow: "auto", maxHeight: 400, display: "flex", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
        />
      )}
    </CodeBlockFrame>
  );
}
