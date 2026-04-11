"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from "@mui/material";
import DOMPurify from "dompurify";
import { useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getPrimaryMain, getTextSecondary } from "../../constants/colors";
import { PREVIEW_MAX_HEIGHT } from "../../constants/dimensions";
import { useEditorFeaturesContext } from "../../contexts/EditorFeaturesContext";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { useBlockResize } from "../../hooks/useBlockResize";
import { MATH_SANITIZE_CONFIG,useKatexRender } from "../../hooks/useKatexRender";
import { MathEditDialog } from "../MathEditDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { shouldShowBorder, shouldShowToolbar } from "./compareHelpers";
import { GraphView } from "./GraphView";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";

type MathBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "tryCloseEdit" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "onFsApply" | "fsDirty" | "discardDialogOpen" | "setDiscardDialogOpen" | "handleDiscardConfirm"
  | "t" | "isDark" | "isEditable" | "isCompareLeft" | "isCompareLeftEditable"
> & {
  handleFsTextChange: (newCode: string) => void;
};

/** Graph toggle button for the math block toolbar (extracted to reduce cognitive complexity). */
function GraphToggleButton({ graphEnabled, onToggle, isDark, t }: Readonly<{
  graphEnabled: boolean; onToggle: () => void; isDark: boolean; t: (key: string) => string;
}>) {
  return (
    <Tooltip title={graphEnabled ? t("hideGraph") : t("showGraph")} placement="top">
      <IconButton
        size="small"
        sx={{ p: 0.25 }}
        onClick={onToggle}
        aria-label={graphEnabled ? t("hideGraph") : t("showGraph")}
      >
        <ShowChartIcon sx={{ fontSize: 16, color: graphEnabled ? getPrimaryMain(isDark) : getTextSecondary(isDark) }} />
      </IconButton>
    </Tooltip>
  );
}

/** Copy-code button for the math edit dialog toolbar (extracted to reduce cognitive complexity). */
function MathCopyCodeButton({ handleCopyCode, isDark, t }: Readonly<{
  handleCopyCode: () => void; isDark: boolean; t: (key: string) => string;
}>) {
  return (
    <Tooltip title={t("copyCode")} placement="bottom">
      <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
        <ContentCopyIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />
      </IconButton>
    </Tooltip>
  );
}

/** Discard-changes confirmation dialog (extracted to reduce cognitive complexity). */
function DiscardDialog({ open, onClose, onConfirm, t }: Readonly<{
  open: boolean; onClose: () => void; onConfirm: () => void; t: (key: string) => string;
}>) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("spreadsheetDiscardTitle")}</DialogTitle>
      <DialogContent><DialogContentText>{t("spreadsheetDiscardMessage")}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("spreadsheetDiscardCancel")}</Button>
        <Button onClick={onConfirm} color="error">{t("spreadsheetDiscardConfirm")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Math preview container with resize support (extracted to reduce cognitive complexity). */
function MathPreview({
  mathContainerRef, code, codeCollapsed, displayWidth, isDark, mathHtml, isSelected, isEditable,
  resizing, resizeWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp,
  selectNode, updateAttributes, setEditOpen, t,
}: Readonly<{
  mathContainerRef: React.RefObject<HTMLDivElement | null>;
  code: string; codeCollapsed: boolean; displayWidth: string | undefined;
  isDark: boolean; mathHtml: string; isSelected: boolean; isEditable: boolean;
  resizing: boolean; resizeWidth: number | null;
  handleResizePointerDown: (e: React.PointerEvent) => void;
  handleResizePointerMove: (e: React.PointerEvent) => void;
  handleResizePointerUp: (e: React.PointerEvent) => void;
  selectNode: () => void; updateAttributes: (attrs: Record<string, unknown>) => void;
  setEditOpen: (v: boolean) => void; t: (key: string) => string;
}>) {
  return (
    <Box
      ref={mathContainerRef}
      contentEditable={false}
      role="img"
      aria-label={`${t("mathFormula")}: ${code}`}
      onClick={() => { selectNode(); if (!codeCollapsed) updateAttributes({ codeCollapsed: true }); }}
      onDoubleClick={() => setEditOpen(true)}
      onPointerMove={handleResizePointerMove}
      onPointerUp={handleResizePointerUp}
      sx={{ pt: 0, px: 2, pb: 2, bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, borderTop: codeCollapsed ? 0 : 1, borderColor: getDivider(isDark), overflow: "auto", maxHeight: PREVIEW_MAX_HEIGHT, display: "flex", justifyContent: "flex-start", cursor: "pointer", position: "relative", width: displayWidth || "fit-content", maxWidth: "100%" }}
    >
      <Box
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
        sx={{ pointerEvents: "none" }}
      />
      <ResizeGrip visible={isSelected && isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
    </Box>
  );
}

export function MathBlock(props: MathBlockProps) {
  const {
    editor, node, updateAttributes, getPos,
    codeCollapsed, isSelected,
    selectNode, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    handleFsTextChange,
    t, isDark,
  } = props;

  const { hideGraph } = useEditorFeaturesContext();
  const [graphEnabled, setGraphEnabled] = useState(false);
  const { html: mathHtml, error: mathError } = useKatexRender({ code, isMath: true });

  const mathContainerRef = useRef<HTMLDivElement>(null);
  const { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp } = useBlockResize({ containerRef: mathContainerRef, updateAttributes, currentWidth: node.attrs.width });

  const { isCompareMode, compareCode, thisCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos, language: "math", code, editOpen,
  });

  const showGraphToggle = !hideGraph && !props.isCompareLeft && !props.isCompareLeftEditable;
  const graphToggle = showGraphToggle
    ? <GraphToggleButton graphEnabled={graphEnabled} onToggle={() => setGraphEnabled(prev => !prev)} isDark={isDark} t={t} />
    : undefined;

  const toolbar = (
    <BlockInlineToolbar
      label="Math"
      onEdit={props.isCompareLeft ? undefined : () => setEditOpen(true)}
      onDelete={props.isCompareLeft ? undefined : () => setDeleteDialogOpen(true)}
      labelOnly={props.isCompareLeftEditable}
      labelDivider
      extra={graphToggle}
      t={t}
    />
  );

  return (
    <CodeBlockFrame
      toolbar={shouldShowToolbar({ isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable: props.isEditable }) ? toolbar : null}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={shouldShowBorder({ isSelected, isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable: props.isEditable })}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <>
        <MathEditDialog
          open={editOpen}
          onClose={() => { fsSearch.reset(); props.tryCloseEdit(); }}
          onApply={props.onFsApply}
          dirty={props.fsDirty}
          label="Math"
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
          toolbarExtra={<MathCopyCodeButton handleCopyCode={handleCopyCode} isDark={isDark} t={t} />}
          t={t}
        />
        <DiscardDialog
          open={props.discardDialogOpen}
          onClose={() => props.setDiscardDialogOpen(false)}
          onConfirm={props.handleDiscardConfirm}
          t={t}
        />
        </>
      }
    >
      {mathError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>{mathError}</Alert>
      )}
      {mathHtml && (
        <MathPreview
          mathContainerRef={mathContainerRef}
          code={code}
          codeCollapsed={codeCollapsed}
          displayWidth={displayWidth}
          isDark={isDark}
          mathHtml={mathHtml}
          isSelected={isSelected}
          isEditable={props.isEditable}
          resizing={resizing}
          resizeWidth={resizeWidth}
          handleResizePointerDown={handleResizePointerDown}
          handleResizePointerMove={handleResizePointerMove}
          handleResizePointerUp={handleResizePointerUp}
          selectNode={selectNode}
          updateAttributes={updateAttributes}
          setEditOpen={setEditOpen}
          t={t}
        />
      )}
      {!hideGraph && <GraphView code={code} enabled={graphEnabled} isDark={isDark} />}
    </CodeBlockFrame>
  );
}
