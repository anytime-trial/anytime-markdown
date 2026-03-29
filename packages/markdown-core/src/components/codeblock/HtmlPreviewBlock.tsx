"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from "@mui/material";
import DOMPurify from "dompurify";
import { useRef } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getTextSecondary } from "../../constants/colors";
import { PREVIEW_MAX_HEIGHT } from "../../constants/dimensions";
import htmlSamples from "../../constants/htmlSamples.json";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { useBlockResize } from "../../hooks/useBlockResize";
import { CodeBlockEditDialog } from "../CodeBlockEditDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { shouldShowBorder } from "./compareHelpers";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";
import { HTML_SANITIZE_CONFIG } from "./types";

type HtmlPreviewBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "tryCloseEdit" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "onFsApply" | "fsDirty" | "discardDialogOpen" | "setDiscardDialogOpen" | "handleDiscardConfirm"
  | "t" | "isDark" | "isEditable" | "isCompareLeft" | "isCompareLeftEditable" | "onExport"
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

  const { isCompareMode, compareCode, thisCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos, language: "html", code, editOpen,
  });

  const htmlContainerRef = useRef<HTMLDivElement>(null);
  const { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp } = useBlockResize({ containerRef: htmlContainerRef, updateAttributes, currentWidth: node.attrs.width });

  const toolbar = (
    <BlockInlineToolbar
      label={t("htmlPreview")}
      onEdit={props.isCompareLeft ? undefined : () => setEditOpen(true)}
      onDelete={props.isCompareLeft ? undefined : () => setDeleteDialogOpen(true)}
      /* onExport: HTMLブロックのキャプチャは一時停止中 */
      labelOnly={props.isCompareLeftEditable}
      labelDivider
      t={t}
    />
  );

  return (
    <CodeBlockFrame
      toolbar={toolbar}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={shouldShowBorder({ isSelected, isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable: props.isEditable })}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <>
        <CodeBlockEditDialog
          open={editOpen}
          onClose={() => { fsSearch.reset(); props.tryCloseEdit(); }}
          onApply={props.onFsApply}
          dirty={props.fsDirty}
          label={t("htmlPreview")}
          language="html"
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          onFsTextChange={handleFsTextChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          readOnly={!props.isEditable}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          thisCode={thisCode}
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
                <ContentCopyIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />
              </IconButton>
            </Tooltip>
          }
          t={t}
        />
        <Dialog open={props.discardDialogOpen} onClose={() => props.setDiscardDialogOpen(false)}>
          <DialogTitle>{t("spreadsheetDiscardTitle")}</DialogTitle>
          <DialogContent><DialogContentText>{t("spreadsheetDiscardMessage")}</DialogContentText></DialogContent>
          <DialogActions>
            <Button onClick={() => props.setDiscardDialogOpen(false)}>{t("spreadsheetDiscardCancel")}</Button>
            <Button onClick={props.handleDiscardConfirm} color="error">{t("spreadsheetDiscardConfirm")}</Button>
          </DialogActions>
        </Dialog>
        </>
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
          sx={{ pt: 0, px: 2, pb: 2, bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, borderTop: codeCollapsed ? 0 : 1, borderColor: getDivider(isDark), overflow: "auto", maxHeight: PREVIEW_MAX_HEIGHT, cursor: "pointer", position: "relative", width: displayWidth || "fit-content", maxWidth: "100%", "& img": { maxWidth: "100%" } }}
        >
          <Box
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG) }}
            sx={{ pointerEvents: "none" }}
          />
          <ResizeGrip visible={isSelected && props.isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
        </Box>
    </CodeBlockFrame>
  );
}
