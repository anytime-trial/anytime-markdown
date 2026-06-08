"use client";

import DOMPurify from "dompurify";
import { useRef } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getTextSecondary, PREVIEW_MAX_HEIGHT, useBlockResize, BlockInlineToolbar } from "@anytime-markdown/markdown-viewer";
import { Button } from "@anytime-markdown/markdown-viewer/src/ui/Button";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@anytime-markdown/markdown-viewer/src/ui/Dialog";
import { IconButton } from "@anytime-markdown/markdown-viewer/src/ui/IconButton";
import { Tooltip } from "@anytime-markdown/markdown-viewer/src/ui/Tooltip";
import { ContentCopyIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";
import styles from "./HtmlPreviewBlock.module.css";
import htmlSamples from "../../constants/htmlSamples.json";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { CodeBlockEditDialog } from "../CodeBlockEditDialog";
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
            <div
              className={styles.renderPreviewBox}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG) }}
            />
          )}
          toolbarExtra={
            <Tooltip title={t("copyCode")} placement="bottom">
              <IconButton size="xs" onClick={handleCopyCode} aria-label={t("copyCode")}>
                <ContentCopyIcon fontSize={16} color={getTextSecondary(isDark)} />
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
      <div
          ref={htmlContainerRef}
          role="document"
          aria-label={t("htmlPreview")}
          contentEditable={false}
          onClick={selectNode}
          onDoubleClick={() => setEditOpen(true)}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          className={styles.htmlContainer}
          style={{
            backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
            borderTop: codeCollapsed ? 0 : "1px solid",
            borderTopColor: getDivider(isDark),
            maxHeight: PREVIEW_MAX_HEIGHT,
            width: displayWidth || "fit-content",
          }}
        >
          <div
            className={styles.htmlInner}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG) }}
          />
          <ResizeGrip visible={isSelected && props.isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
        </div>
    </CodeBlockFrame>
  );
}
