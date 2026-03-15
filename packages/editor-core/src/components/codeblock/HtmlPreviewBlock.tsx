"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Box, IconButton, Tooltip } from "@mui/material";
import DOMPurify from "dompurify";
import { useRef } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../../constants/colors";
import { PREVIEW_MAX_HEIGHT } from "../../constants/dimensions";
import htmlSamples from "../../constants/htmlSamples.json";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { useBlockResize } from "../../hooks/useBlockResize";
import { CodeBlockEditDialog } from "../CodeBlockEditDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";
import { HTML_SANITIZE_CONFIG } from "./types";

type HtmlPreviewBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
> & {
  handleFsTextChange: (newCode: string) => void;
};

export function HtmlPreviewBlock(props: HtmlPreviewBlockProps) {
  const {
    editor, node, updateAttributes, getPos,
    codeCollapsed, isSelected,
    selectNode, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    handleFsTextChange,
    t, isDark,
  } = props;

  const { isCompareMode, compareCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos, language: "html", code, editOpen,
  });

  const htmlContainerRef = useRef<HTMLDivElement>(null);
  const { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp } = useBlockResize({ containerRef: htmlContainerRef, updateAttributes, currentWidth: node.attrs.width });

  const toolbar = (
    <BlockInlineToolbar
      label={t("htmlPreview")}
      onEdit={() => setEditOpen(true)}
      onDelete={() => setDeleteDialogOpen(true)}
      t={t}
    />
  );

  return (
    <CodeBlockFrame
      toolbar={toolbar}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={isSelected}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <CodeBlockEditDialog
          open={editOpen}
          onClose={() => { fsSearch.reset(); setEditOpen(false); }}
          label={t("htmlPreview")}
          language="html"
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          onFsTextChange={handleFsTextChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          readOnly={!editor.isEditable}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          customSamples={htmlSamples.filter((s) => s.enabled)}
          renderPreview={(code) => (
            <Box
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG) }}
              sx={{ "& img": { maxWidth: "100%" } }}
            />
          )}
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
      <Box
          ref={htmlContainerRef}
          role="document"
          aria-label={t("htmlPreview")}
          contentEditable={false}
          onClick={selectNode}
          onDoubleClick={() => setEditOpen(true)}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          sx={{ pt: 0, px: 2, pb: 2, bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, borderTop: codeCollapsed ? 0 : 1, borderColor: "divider", overflow: "auto", maxHeight: PREVIEW_MAX_HEIGHT, cursor: "pointer", position: "relative", width: displayWidth || "fit-content", maxWidth: "100%", "& img": { maxWidth: "100%" } }}
        >
          <Box
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG) }}
            sx={{ pointerEvents: "none" }}
          />
          <ResizeGrip visible={isSelected && editor.isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
        </Box>
    </CodeBlockFrame>
  );
}
